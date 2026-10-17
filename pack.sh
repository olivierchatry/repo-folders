#!/bin/sh
# Builds the Chrome Web Store upload.
#   ./pack.sh                -> dist/repo-folders-<version>.zip
#   ./pack.sh --crx key.pem  -> also dist/repo-folders-<version>.crx, signed with your key (verified uploads)
set -e
cd "$(dirname "$0")"
node test.js
version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)
zip="dist/repo-folders-$version.zip"
mkdir -p dist
rm -f "$zip"
zip -q "$zip" manifest.json background.js folders.js content.js content.css options.html options.js icons/*.png
echo "$zip"

[ "$1" = "--crx" ] || exit 0
key=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
stage=$(mktemp -d)
mkdir "$stage/repo-folders"
unzip -q "$zip" -d "$stage/repo-folders"
# A separate profile, so packing works while your own Chrome is open.
"${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" --user-data-dir="$stage/profile" \
  --pack-extension="$stage/repo-folders" --pack-extension-key="$key" >/dev/null 2>&1
mv "$stage/repo-folders.crx" "dist/repo-folders-$version.crx"
rm -rf "$stage"
echo "dist/repo-folders-$version.crx"
