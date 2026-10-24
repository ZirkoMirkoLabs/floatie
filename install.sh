#!/bin/bash
# Floatie installer for macOS 12+ (Apple Silicon and Intel). Run in Terminal:
#   curl -fsSL https://raw.githubusercontent.com/ZirkoMirkoLabs/floatie/main/install.sh | bash
# Downloads the newest build from GitHub Releases into /Applications and opens it.
# Re-run it any time to update; your tasks and clipboard history are kept.
set -euo pipefail
REPO="ZirkoMirkoLabs/floatie"

[ "$(uname)" = "Darwin" ] || { echo "This installer is for macOS. On Windows, use install.ps1."; exit 1; }
ARCH=$(uname -m); [ "$ARCH" = "arm64" ] || ARCH=x64

URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o "\"browser_download_url\": *\"[^\"]*-mac-$ARCH\.zip\"" | head -1 | sed -E 's/.*"(https[^"]*)"/\1/')
[ -n "$URL" ] || { echo "No macOS build for $ARCH in the latest release."; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "Downloading $(basename "$URL")..."
curl -fL --progress-bar "$URL" -o "$TMP/floatie.zip"
ditto -x -k "$TMP/floatie.zip" "$TMP"

pkill -x Floatie 2>/dev/null || true
rm -rf /Applications/Floatie.app
mv "$TMP/Floatie.app" /Applications/
# Builds are not notarized yet: clear the download flag and ad-hoc sign so macOS will open it.
xattr -dr com.apple.quarantine /Applications/Floatie.app 2>/dev/null || true
codesign --force --deep --sign - /Applications/Floatie.app 2>/dev/null || true

open /Applications/Floatie.app
echo "Floatie is installed in Applications. Press Cmd+Shift+Space to show or hide it."
