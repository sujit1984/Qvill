#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/mac/Qvill.app"
STAGE="$ROOT/dist/mac/dmg-root"
ICONSET="$ROOT/dist/mac/Qvill.iconset"
DMG="$ROOT/dist/mac/Qvill-0.1.0-arm64.dmg"

for tool in clang hdiutil codesign; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing macOS build tool: $tool" >&2
    exit 1
  fi
done

rm -rf "$ROOT/dist/mac"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$STAGE"
cp "$ROOT/apps/desktop/Info.plist" "$APP/Contents/Info.plist"
mkdir -p "$ICONSET"
for spec in "16 16x16" "32 16x16@2x" "32 32x32" "64 32x32@2x" "128 128x128" "256 128x128@2x" "256 256x256" "512 256x256@2x" "512 512x512" "1024 512x512@2x"; do
  set -- $spec
  sips -z "$1" "$1" "$ROOT/Qvill.png" --out "$ICONSET/icon_$2.png" >/dev/null
done
python3 "$ROOT/scripts/make-icon.py" "$ICONSET" "$ROOT/dist/mac/Qvill.icns"
cp "$ROOT/dist/mac/Qvill.icns" "$APP/Contents/Resources/Qvill.icns"
cp -R "$ROOT/apps/desktop/web" "$APP/Contents/Resources/web"
mkdir -p "$ROOT/.cache/clang-modules"
clang -fobjc-arc -O2 -mmacosx-version-min=13.0 -fmodules-cache-path="$ROOT/.cache/clang-modules" \
  -framework Cocoa -framework WebKit \
  "$ROOT/apps/desktop/native/main.m" \
  -o "$APP/Contents/MacOS/Qvill"
codesign --force --deep --sign - "$APP"
cp -R "$APP" "$STAGE/Qvill.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname Qvill -srcfolder "$STAGE" -ov -format UDZO "$DMG"
echo "Created $DMG"
