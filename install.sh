#!/bin/sh
set -eu

APP_NAME="${APP_NAME:-singbox-center}"
REPO_OWNER="${REPO_OWNER:-}"
REPO_NAME="${REPO_NAME:-singbox-center}"
REPO_BRANCH_INPUT="${REPO_BRANCH:-}"
REPO_BRANCH="${REPO_BRANCH_INPUT:-main}"
REPO_ARCHIVE_URL="${REPO_ARCHIVE_URL:-}"

INSTALL_DIR="${INSTALL_DIR:-/opt/singbox-center}"
CONFIG_DIR="${CONFIG_DIR:-/etc/singbox-center}"
ENV_FILE="${ENV_FILE:-$CONFIG_DIR/singbox-center.env}"
DATA_DIR="${DATA_DIR:-/var/lib/singbox-center}"
LOG_DIR="${LOG_DIR:-/var/log/singbox-center}"
RUNNER_FILE="${RUNNER_FILE:-/usr/local/bin/singbox-center}"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
COOKIE_SECURE="${COOKIE_SECURE:-false}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

ACTION="${1:-install}"
PURGE="${2:-}"

log() {
  printf '%s\n' "[$APP_NAME] $*"
}

die() {
  printf '%s\n' "[$APP_NAME] ERROR: $*" >&2
  exit 1
}

need_root() {
  if [ "$(id -u)" != "0" ]; then
    die "Please run as root."
  fi
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

detect_os() {
  OS_ID=""
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-}"
  fi

  case "$OS_ID" in
    alpine)
      PKG_MANAGER="apk"
      INIT_SYSTEM="openrc"
      ;;
    ubuntu|debian)
      PKG_MANAGER="apt"
      if have_cmd systemctl && [ -d /run/systemd/system ]; then
        INIT_SYSTEM="systemd"
      elif have_cmd rc-service; then
        INIT_SYSTEM="openrc"
      else
        die "Unsupported init system. systemd or OpenRC is required."
      fi
      ;;
    *)
      if have_cmd apk; then
        PKG_MANAGER="apk"
        INIT_SYSTEM="openrc"
      elif have_cmd apt-get; then
        PKG_MANAGER="apt"
        if have_cmd systemctl && [ -d /run/systemd/system ]; then
          INIT_SYSTEM="systemd"
        else
          die "Unsupported init system. systemd or OpenRC is required."
        fi
      else
        die "Unsupported Linux distribution. Alpine, Ubuntu, or Debian is required."
      fi
      ;;
  esac
}

install_packages() {
  log "Checking dependencies..."
  case "$PKG_MANAGER" in
    apk)
      apk update
      apk add --no-cache nodejs npm python3 make g++ sqlite curl wget ca-certificates tar
      ;;
    apt)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y nodejs npm python3 make g++ sqlite3 curl wget ca-certificates tar
      ;;
    *)
      die "Unknown package manager: $PKG_MANAGER"
      ;;
  esac
}

check_node_version() {
  have_cmd node || die "node is not installed."
  NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
    die "Node.js 18 or newer is required. Current version: $(node -v)"
  fi
}

install_pm2() {
  if have_cmd pm2; then
    log "pm2 is already installed: $(pm2 -v)"
    return
  fi

  log "Installing pm2..."
  npm install -g pm2
}

archive_url() {
  if [ -z "$REPO_OWNER" ]; then
    die "REPO_OWNER is required. Example: REPO_OWNER=yourname sh install.sh"
  fi

  printf 'https://github.com/%s/%s/archive/refs/heads/%s.tar.gz\n' "$REPO_OWNER" "$REPO_NAME" "$1"
}

download_file() {
  URL="$1"
  OUTPUT="$2"

  if have_cmd curl; then
    curl -fL "$URL" -o "$OUTPUT"
  elif have_cmd wget; then
    wget -O "$OUTPUT" "$URL"
  else
    die "curl or wget is required."
  fi
}

stop_legacy_service_if_exists() {
  case "${INIT_SYSTEM:-}" in
    systemd)
      if systemctl list-unit-files "$APP_NAME.service" >/dev/null 2>&1; then
        systemctl stop "$APP_NAME" >/dev/null 2>&1 || true
        systemctl disable "$APP_NAME" >/dev/null 2>&1 || true
        rm -f "/etc/systemd/system/$APP_NAME.service"
        systemctl daemon-reload
      fi
      ;;
    openrc)
      if [ -x "/etc/init.d/$APP_NAME" ]; then
        rc-service "$APP_NAME" stop >/dev/null 2>&1 || true
        rc-update del "$APP_NAME" default >/dev/null 2>&1 || true
        rm -f "/etc/init.d/$APP_NAME"
      fi
      ;;
  esac
}

stop_pm2_process_if_exists() {
  if have_cmd pm2; then
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  fi
}

prepare_directories() {
  mkdir -p "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
}

write_env_file() {
  if [ -f "$ENV_FILE" ]; then
    log "Keeping existing env file: $ENV_FILE"
    return
  fi

  cat > "$ENV_FILE" <<EOF
HOST=$HOST
PORT=$PORT
DATA_DIR=$DATA_DIR
DB_PATH=$DATA_DIR/singbox-center.db
COOKIE_SECURE=$COOKIE_SECURE
GITHUB_TOKEN=$GITHUB_TOKEN
EOF
  chmod 600 "$ENV_FILE"
  log "Created env file: $ENV_FILE"
}

deploy_source() {
  TMP_DIR="$(mktemp -d)"
  ARCHIVE="$TMP_DIR/source.tar.gz"

  if [ -n "$REPO_ARCHIVE_URL" ]; then
    log "Downloading source: $REPO_ARCHIVE_URL"
    download_file "$REPO_ARCHIVE_URL" "$ARCHIVE"
  else
    URL="$(archive_url "$REPO_BRANCH")"
    log "Downloading source: $URL"
    if ! download_file "$URL" "$ARCHIVE"; then
      if [ -z "$REPO_BRANCH_INPUT" ]; then
        if [ "$REPO_BRANCH" = "main" ]; then
          FALLBACK_BRANCH="master"
        else
          FALLBACK_BRANCH="main"
        fi
        FALLBACK_URL="$(archive_url "$FALLBACK_BRANCH")"
        log "Download failed. Trying fallback branch: $FALLBACK_BRANCH"
        download_file "$FALLBACK_URL" "$ARCHIVE"
        REPO_BRANCH="$FALLBACK_BRANCH"
      else
        die "Failed to download source archive for branch: $REPO_BRANCH"
      fi
    fi
  fi

  mkdir -p "$TMP_DIR/extract"
  tar -xzf "$ARCHIVE" -C "$TMP_DIR/extract"

  SRC_DIR="$(find "$TMP_DIR/extract" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "$SRC_DIR" ] || die "Archive did not contain a source directory."
  [ -f "$SRC_DIR/package.json" ] || die "Archive does not look like a Node.js project."

  stop_pm2_process_if_exists
  stop_legacy_service_if_exists

  if [ -d "$INSTALL_DIR" ]; then
    BACKUP_DIR="$INSTALL_DIR.backup.$(date +%Y%m%d%H%M%S)"
    log "Moving current install to: $BACKUP_DIR"
    mv "$INSTALL_DIR" "$BACKUP_DIR"
  fi

  mkdir -p "$(dirname "$INSTALL_DIR")"
  mv "$SRC_DIR" "$INSTALL_DIR"
  rm -rf "$TMP_DIR"
}

install_node_dependencies() {
  log "Installing npm dependencies..."
  cd "$INSTALL_DIR"
  npm install --omit=dev
  npm run check
}

write_runner() {
  mkdir -p "$(dirname "$RUNNER_FILE")"
  cat > "$RUNNER_FILE" <<EOF
#!/bin/sh
set -eu

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

cd "$INSTALL_DIR"
exec /usr/bin/npm start
EOF
  chmod +x "$RUNNER_FILE"
}

start_pm2_process() {
  log "Starting app with pm2..."
  pm2 start "$RUNNER_FILE" \
    --interpreter /bin/sh \
    --name "$APP_NAME" \
    --time \
    --output "$LOG_DIR/$APP_NAME.out.log" \
    --error "$LOG_DIR/$APP_NAME.err.log"
}

write_openrc_pm2_service() {
  PM2_BIN="$(command -v pm2)"
  cat > /etc/init.d/pm2-root <<EOF
#!/sbin/openrc-run

name="pm2-root"
description="pm2 process manager for root"
command="$PM2_BIN"
command_user="root"
pidfile="/root/.pm2/pm2.pid"

depend() {
  need net
}

start() {
  ebegin "Starting pm2"
  HOME=/root "\$command" resurrect
  eend \$?
}

stop() {
  ebegin "Stopping pm2"
  HOME=/root "\$command" kill
  eend \$?
}
EOF
  chmod +x /etc/init.d/pm2-root
  rc-update add pm2-root default
}

install_pm2_startup() {
  log "Saving pm2 process list..."
  pm2 save

  log "Configuring pm2 startup for $INIT_SYSTEM..."
  case "$INIT_SYSTEM" in
    systemd)
      pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || {
        log "pm2 startup failed. The app is running now, but boot startup may need manual setup."
      }
      ;;
    openrc)
      write_openrc_pm2_service
      ;;
    *)
      log "Unknown init system for pm2 startup: $INIT_SYSTEM"
      ;;
  esac
}

print_status() {
  if have_cmd pm2; then
    pm2 status "$APP_NAME" || true
  else
    log "pm2 is not installed."
  fi
}

print_done() {
  log "Done."
  log "URL: http://SERVER_IP:$PORT"
  log "Env file: $ENV_FILE"
  log "Data dir: $DATA_DIR"

  log "Status: pm2 status $APP_NAME"
  log "Logs: pm2 logs $APP_NAME"
  log "Restart: pm2 restart $APP_NAME"
}

do_install_or_update() {
  need_root
  detect_os
  install_packages
  check_node_version
  install_pm2
  prepare_directories
  write_env_file
  deploy_source
  install_node_dependencies
  write_runner
  start_pm2_process
  install_pm2_startup
  print_done
}

do_uninstall() {
  need_root
  detect_os
  stop_pm2_process_if_exists
  stop_legacy_service_if_exists
  if have_cmd pm2; then
    pm2 save >/dev/null 2>&1 || true
  fi

  rm -f "$RUNNER_FILE"
  rm -rf "$INSTALL_DIR"
  if [ "$PURGE" = "--purge" ]; then
    rm -rf "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
    log "Removed program, config, data, and logs."
  else
    log "Removed program and pm2 process. Config and data were kept."
    log "Use '$0 uninstall --purge' to remove config and data too."
  fi
}

case "$ACTION" in
  install|update)
    do_install_or_update
    ;;
  uninstall)
    do_uninstall
    ;;
  status)
    need_root
    detect_os
    print_status
    ;;
  *)
    cat <<EOF
Usage:
  REPO_OWNER=<github-user> sh install.sh [install|update|status|uninstall]

Options via environment variables:
  REPO_OWNER        GitHub owner or organization. Required unless REPO_ARCHIVE_URL is set.
  REPO_NAME         GitHub repository name. Default: singbox-center
  REPO_BRANCH       GitHub branch. Default: main
  REPO_ARCHIVE_URL  Custom .tar.gz archive URL.
  INSTALL_DIR       Default: /opt/singbox-center
  DATA_DIR          Default: /var/lib/singbox-center
  PORT              Default: 3000

Examples:
  REPO_OWNER=yourname sh install.sh
  REPO_OWNER=yourname REPO_BRANCH=master sh install.sh update
  sh install.sh uninstall
  sh install.sh uninstall --purge
EOF
    exit 1
    ;;
esac
