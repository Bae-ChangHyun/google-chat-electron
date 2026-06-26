#!/usr/bin/env bash
#
# Install or update Google Chat Desktop (this fork) on macOS from the latest
# GitHub release. Re-running this script updates an existing install.
#
#   curl -fsSL https://raw.githubusercontent.com/Bae-ChangHyun/google-chat-electron/main/scripts/install-mac.sh | bash
#
# The build is unsigned, so this strips the quarantine flag and ad-hoc signs the
# app (required for it to launch, especially on Apple Silicon).
set -euo pipefail

REPO="Bae-ChangHyun/google-chat-electron"
APP="/Applications/google-chat-electron.app"

case "$(uname -m)" in
  arm64)  want="darwin-arm64" ;;
  x86_64) want="darwin-x64" ;;
  *) echo "error: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

echo "Querying latest release of ${REPO} (${want}) …"
asset_url="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -oE '"browser_download_url": *"[^"]*'"${want}"'[^"]*\.zip"' \
  | head -1 | sed -E 's/.*"(https[^"]+)".*/\1/')"

if [ -z "${asset_url:-}" ]; then
  echo "error: no ${want} .zip asset found in the latest release of ${REPO}" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

echo "Downloading $(basename "${asset_url}") …"
curl -fL --progress-bar "${asset_url}" -o "${tmp}/gchat.zip"

echo "Extracting …"
ditto -x -k "${tmp}/gchat.zip" "${tmp}/app"

echo "Installing to ${APP} …"
rm -rf "${APP}"
ditto "${tmp}/app/google-chat-electron.app" "${APP}"

echo "Clearing quarantine and ad-hoc signing (unsigned build) …"
xattr -dr com.apple.quarantine "${APP}" 2>/dev/null || true
codesign --force --deep -s - "${APP}" 2>/dev/null || true

echo "Launching …"
open "${APP}"

echo "Done — installed to ${APP}."
