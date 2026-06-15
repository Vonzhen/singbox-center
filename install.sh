#!/bin/sh
set -eu

APP_NAME="${APP_NAME:-singbox-center}"
REPO_OWNER="${REPO_OWNER:-}"
REPO_NAME="${REPO_NAME:-singbox-center}"
REPO_BRANCH="${REPO_BRANCH:-main}"
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
        INIT_SYSTEM="systemd"
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

archive_url() {
  if [ -n "$REPO_ARCHIVE_URL" ]; then
    printf '%s\n' "$REPO_ARCHIVE_URL"
    return
  fi

  if [ -z "$REPO_OWNER" ]; then
    die "REPO_OWNER is required. Example: REPO_OWNER=yourname sh install.sh"
  fi

  printf 'https://github.com/%s/%s/archive/refs/heads/%s.tar.gz\n' "$REPO_OWNER" "$REPO_NAME" "$REPO_BRANCH"
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

stop_service_if_exists() {
  case "${INIT_SYSTEM:-}" in
    systemd)
      if systemctl list-unit-files "$APP_NAME.service" >/dev/null 2>&1; then
        systemctl stop "$APP_NAME" >/dev/null 2>&1 || true
      fi
      ;;
    openrc)
      if [ -x "/etc/init.d/$APP_NAME" ]; then
        rc-service "$APP_NAME" stop >/dev/null 2>&1 || true
      fi
      ;;
  esac
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
  URL="$(archive_url)"
  TMP_DIR="$(mktemp -d)"
  ARCHIVE="$TMP_DIR/source.tar.gz"

  log "Downloading source: $URL"
  download_file "$URL" "$ARCHIVE"

  mkdir -p "$TMP_DIR/extract"
  tar -xzf "$ARCHIVE" -C "$TMP_DIR/extract"

  SRC_DIR="$(find "$TMP_DIR/extract" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "$SRC_DIR" ] || die "Archive did not contain a source directory."
  [ -f "$SRC_DIR/package.json" ] || die "Archive does not look like a Node.js project."

  stop_service_if_exists

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

write_systemd_service() {
  cat > "/etc/systemd/system/$APP_NAME.service" <<EOF
[Unit]
Description=sing-box config center
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$RUNNER_FILE
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now "$APP_NAME"
}

write_openrc_service() {
  cat > "/etc/init.d/$APP_NAME" <<EOF
#!/sbin/openrc-run

name="$APP_NAME"
description="sing-box config center"
command="$RUNNER_FILE"
command_args=""
directory="$INSTALL_DIR"
command_user="root"
supervisor="supervise-daemon"
output_log="$LOG_DIR/$APP_NAME.log"
error_log="$LOG_DIR/$APP_NAME.err"

depend() {
  need net
}

start_pre() {
  checkpath -d -m 0755 "$DATA_DIR"
  checkpath -d -m 0755 "$LOG_DIR"
}
EOF

  chmod +x "/etc/init.d/$APP_NAME"
  rc-update add "$APP_NAME" default
  rc-service "$APP_NAME" restart
}

install_service() {
  log "Installing service for $INIT_SYSTEM..."
  case "$INIT_SYSTEM" in
    systemd)
      write_systemd_service
      ;;
    openrc)
      write_openrc_service
      ;;
    *)
      die "Unsupported init system: $INIT_SYSTEM"
      ;;
  esac
}

print_status() {
  case "$INIT_SYSTEM" in
    systemd)
      systemctl --no-pager status "$APP_NAME" || true
      ;;
    openrc)
      rc-service "$APP_NAME" status || true
      ;;
  esac
}

print_done() {
  log "Done."
  log "URL: http://SERVER_IP:$PORT"
  log "Env file: $ENV_FILE"
  log "Data dir: $DATA_DIR"

  case "$INIT_SYSTEM" in
    systemd)
      log "Logs: journalctl -u $APP_NAME -f"
      ;;
    openrc)
      log "Logs: tail -f $LOG_DIR/$APP_NAME.log"
      ;;
  esac
}

do_install_or_update() {
  need_root
  detect_os
  install_packages
  check_node_version
  prepare_directories
  write_env_file
  deploy_source
  install_node_dependencies
  write_runner
  install_service
  print_done
}

do_uninstall() {
  need_root
  detect_os
  stop_service_if_exists

  case "$INIT_SYSTEM" in
    systemd)
      systemctl disable "$APP_NAME" >/dev/null 2>&1 || true
      rm -f "/etc/systemd/system/$APP_NAME.service"
      systemctl daemon-reload
      ;;
    openrc)
      rc-update del "$APP_NAME" default >/dev/null 2>&1 || true
      rm -f "/etc/init.d/$APP_NAME"
      ;;
  esac

  rm -f "$RUNNER_FILE"
  rm -rf "$INSTALL_DIR"
  if [ "$PURGE" = "--purge" ]; then
    rm -rf "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
    log "Removed program, config, data, and logs."
  else
    log "Removed program and service. Config and data were kept."
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
