#!/usr/bin/env bash
#
# Install or update Google Chat Desktop (this fork) from the latest GitHub release.
# Re-running this script updates an existing install.
#
#   curl -fsSL https://raw.githubusercontent.com/Bae-ChangHyun/google-chat-electron/main/scripts/install.sh | bash
#
set -euo pipefail

REPO="Bae-ChangHyun/google-chat-electron"
PKG="google-chat-electron"

echo "Querying latest release of ${REPO} …"
asset_url="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -oE '"browser_download_url": *"[^"]*\.deb"' \
  | head -1 | sed -E 's/.*"(https[^"]+)".*/\1/')"

if [ -z "${asset_url:-}" ]; then
  echo "error: no .deb asset found in the latest release of ${REPO}" >&2
  exit 1
fi

deb_name="$(basename "${asset_url}")"
cur_ver="$(dpkg-query -W -f='${Version}' "${PKG}" 2>/dev/null || true)"
echo "Installed: ${cur_ver:-none}"
echo "Release  : ${deb_name}"

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

echo "Downloading ${deb_name} …"
curl -fL --progress-bar "${asset_url}" -o "${tmp}/${PKG}.deb"

echo "Installing (sudo may prompt for your password) …"
sudo apt install -y --allow-downgrades "${tmp}/${PKG}.deb"

echo "Done — ${PKG} $(dpkg-query -W -f='${Version}' "${PKG}" 2>/dev/null) installed."
