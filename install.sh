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
/usr/bin/ditto -x -k "$TMP/floatie.zip" "$TMP/new"
APP="$TMP/new/Floatie.app"
[ -x "$APP/Contents/MacOS/Floatie" ] || { echo "The download doesn't contain Floatie.app. Nothing was changed."; exit 1; }

# Builds are not notarized yet: clear the download flag and ad-hoc sign the new copy before it replaces anything.
# System tools by full path: a pip/pyenv `xattr` earlier on PATH doesn't understand -r.
/usr/bin/xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
/usr/bin/codesign --force --deep --sign - "$APP" || { echo "Couldn't sign the app. Nothing was changed."; exit 1; }

# swap it in, keeping the old copy until the new one is in place
pkill -x Floatie 2>/dev/null || true
[ -d /Applications/Floatie.app ] && mv /Applications/Floatie.app "$TMP/old.app"
if ! mv "$APP" /Applications/Floatie.app; then
  [ -d "$TMP/old.app" ] && mv "$TMP/old.app" /Applications/Floatie.app
  echo "Couldn't install to /Applications. Your previous version was put back."; exit 1
fi

open /Applications/Floatie.app
echo "Floatie is installed in Applications. Press Cmd+Shift+Space to show or hide it."
