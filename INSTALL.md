# singbox-center one-click install

This project can be installed from GitHub source archives with the root `install.sh`.
It supports Alpine, Ubuntu, and Debian.

## Upload to GitHub

Upload the project files to a GitHub repository, for example:

```text
https://github.com/yourname/singbox-center
```

The script downloads the branch archive from GitHub. It does not require this local
directory to be a git repository.

## Install

Run as root on the target server:

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | REPO_OWNER=yourname sh
```

If the server does not have `curl`:

```sh
wget -qO- https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | REPO_OWNER=yourname sh
```

If your default branch is `master`:

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/master/install.sh | REPO_OWNER=yourname REPO_BRANCH=master sh
```

For an organization or a different repository name:

```sh
curl -fsSL https://raw.githubusercontent.com/myorg/myrepo/main/install.sh | REPO_OWNER=myorg REPO_NAME=myrepo sh
```

## What the installer does

- Detects Alpine, Ubuntu, or Debian.
- Installs missing runtime and build dependencies.
- Downloads the GitHub branch archive.
- Installs the app to `/opt/singbox-center`.
- Creates `/etc/singbox-center/singbox-center.env`.
- Stores data in `/var/lib/singbox-center`.
- Creates a systemd service on Ubuntu/Debian.
- Creates an OpenRC service on Alpine.
- Starts the service and enables it at boot.

## Paths

```text
/opt/singbox-center
/etc/singbox-center/singbox-center.env
/var/lib/singbox-center
/var/log/singbox-center
```

## Update

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | REPO_OWNER=yourname sh -s -- update
```

Data and existing environment configuration are kept.

## Status

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | sh -s -- status
```

## Uninstall

Remove the program and service, but keep config and data:

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | sh -s -- uninstall
```

Remove program, service, config, data, and logs:

```sh
curl -fsSL https://raw.githubusercontent.com/yourname/singbox-center/main/install.sh | sh -s -- uninstall --purge
```

## Logs

Ubuntu/Debian:

```sh
journalctl -u singbox-center -f
```

Alpine:

```sh
tail -f /var/log/singbox-center/singbox-center.log
```

## Environment

Edit:

```text
/etc/singbox-center/singbox-center.env
```

Default values:

```env
HOST=0.0.0.0
PORT=3000
DATA_DIR=/var/lib/singbox-center
DB_PATH=/var/lib/singbox-center/singbox-center.db
COOKIE_SECURE=false
GITHUB_TOKEN=
```

Restart after changing the file:

```sh
systemctl restart singbox-center
```

or on Alpine:

```sh
rc-service singbox-center restart
```
