#!/bin/sh
# Builds the store uploads from one source tree:
#   ./pack.sh                -> dist/repo-folders-<version>.zip          (Chrome Web Store, Edge Add-ons)
#                               dist/repo-folders-<version>-firefox.zip  (addons.mozilla.org)
#   ./pack.sh --crx key.pem  -> also dist/repo-folders-<version>.crx, signed with your key (Chrome verified uploads)
# dist/chrome and dist/firefox hold the unpacked builds (e.g. `npx web-ext run --source-dir dist/firefox`).
set -e
cd "$(dirname "$0")"
node test.js
version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)
rm -rf dist/chrome dist/firefox
for browser in chrome firefox; do
  mkdir -p "dist/$browser/icons"
  cp background.js folders.js content.js content.css options.html options.js "dist/$browser/"
  cp icons/*.png "dist/$browser/icons/"
  # manifest.json is Chrome's. Firefox has no extension service worker: background scripts instead, plus its
  # add-on ID, minimum version and the data-collection declaration addons.mozilla.org requires.
  node -e '
    const fs = require("fs"), [file, browser] = process.argv.slice(1)
    const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"))
    if (browser === "firefox") Object.assign(m, {
      background: { scripts: ["folders.js", "background.js"] },
      browser_specific_settings: { gecko: {
        id: "repo-folders@olivierchatry",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["authenticationInfo", "websiteContent"] },
      } },
    })
    fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n")
  ' "dist/$browser/manifest.json" "$browser"
done
rm -f "dist/repo-folders-$version.zip" "dist/repo-folders-$version-firefox.zip"
(cd dist/chrome && zip -qr "../repo-folders-$version.zip" .)
(cd dist/firefox && zip -qr "../repo-folders-$version-firefox.zip" .)
echo "dist/repo-folders-$version.zip"
echo "dist/repo-folders-$version-firefox.zip"

[ "$1" = "--crx" ] || exit 0
key=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
stage=$(mktemp -d)
cp -R dist/chrome "$stage/repo-folders"
# A separate profile, so packing works while your own Chrome is open.
"${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" --user-data-dir="$stage/profile" \
  --pack-extension="$stage/repo-folders" --pack-extension-key="$key" >/dev/null 2>&1
mv "$stage/repo-folders.crx" "dist/repo-folders-$version.crx"
rm -rf "$stage"
echo "dist/repo-folders-$version.crx"
