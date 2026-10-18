# Repo Folders for GitHub

A browser extension that organizes GitHub repositories into folders:

- **Organizations**: a **Folders** tree in the left sidebar of `github.com/orgs/<org>/repositories`. Folders are
  stored in the organization itself, so every member sees the same tree.
- **Your own account**: a **Folders** box above the list on your profile's Repositories tab
  (`github.com/<you>?tab=repositories`). These folders are private to you and sync through your browser.

Works in Chrome, Edge, Brave, Arc, Opera, Vivaldi and Firefox (140+).

## Install

1. Install **Repo Folders for GitHub** from the Chrome Web Store (Chrome, Brave, Arc, Opera, Vivaldi), Microsoft
   Edge Add-ons, or Firefox Add-ons.
2. Organizations: open the organization's Repositories page and click **Sign in with GitHub** in the Folders
   section. Enter the code it shows at github.com/login/device.
3. If the sidebar says the app isn't installed on the organization, an organization owner clicks **Install it**
   and installs the [Repo Folders app](https://github.com/apps/repo-folders) with **All repositories**.
   Members can request it from the same page.

One sign-in covers every organization where the app is installed. Members can browse folders; changing them
needs an organization owner. Your own account's folders need no sign-in at all. The popup (toolbar icon) shows
whether you're signed in and lets you sign out.

What the app is allowed to do, and what to watch for, is in [SECURITY.md](SECURITY.md).

## Use

- **Organizations**: click a folder to filter GitHub's list to it (`props.folder:"Team/Project"`); **Unfiled**
  shows repositories without a folder (`no:props.folder`). The list updates in place, without a page reload.
- **Your account**: click a folder to open it; it lists its repositories. GitHub's search has no folder filter
  for personal accounts, so the folder itself is the list.
- **Drag a repository** from GitHub's list onto a folder to file it there. In an organization, drop it on
  **Unfiled** to take it out; in your account, use the **×** next to it in its folder.
- Hover a folder for **+** (new subfolder), **✎** (rename or move: edit the full path, e.g. `Old/X` → `New/X`)
  and **×** (delete after a confirmation; its repositories become unfiled).

## Where the folders live

**Organizations** use an organization **custom property** named `folder`, type *single select*:

- Its allowed values are the folder paths (`Backend`, `Backend/Services`, …), which is why empty folders can exist.
- Each repository's `folder` value is its folder; no value = unfiled.
- The first folder creates the property; deleting the last folder deletes it.

It is a normal custom property, so it also shows in repository settings, in `props.folder:` searches and in the
API (`GET /orgs/<org>/properties/values`). Limits from GitHub: at most 200 folders counting every path, names in
printable ASCII without `"`.

**Your account** has no custom properties, so its folders are kept in the browser's synced storage
(`storage.sync`): Chrome Sync or Firefox Sync carries them to your other devices in the same browser. Nothing is
stored on GitHub.

## Known limits

- Edits to an organization's folder list are read-modify-write: two people changing folders in the same second
  can lose one change. Moving repositories has no such issue.
- Folder renames update repositories 30 at a time (API limit), so a big rename takes a few seconds.
- GitHub's search index sees a move about 3 seconds after it is saved: a repository dragged out of a folder
  view disappears from the list at once, but the list's repository count catches up a few seconds later.
- Your account's folders don't sync between different browsers (Chrome and Firefox keep their own), and one
  browser-sync item holds about 400 filed repositories.

## Develop

- Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → this folder. After a change, click
  the extension's reload icon there, then reload the GitHub tab.
- Firefox: `./pack.sh`, then `npx web-ext run --source-dir dist/firefox` (add
  `--firefox="/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox"` for Developer Edition).
- `node test.js` checks the folder logic, that the content script starts in both modes, and that the service
  worker refuses requests from other pages, other organizations and crafted names without calling GitHub,
  including with Firefox's background script and message sender.
- `./pack.sh` builds `dist/repo-folders-<version>.zip` (Chrome Web Store, Edge Add-ons) and
  `dist/repo-folders-<version>-firefox.zip` (addons.mozilla.org); `./pack.sh --crx key.pem` also builds the
  signed `.crx` the Chrome Web Store requires once verified uploads are on. See [RELEASE.md](RELEASE.md).
- `manifest.json` is Chrome's (load this folder unpacked as is); `pack.sh` writes the Firefox manifest from it,
  with background scripts instead of the service worker and Firefox's add-on settings.
- `background.js` holds the sign-in and makes every GitHub call; `content.js` draws the folders and sends it
  requests, which `background.js` checks against the page that sent them. Personal folders never involve it.
- The GitHub App (`CLIENT_ID` in `background.js`) is [Repo Folders](https://github.com/apps/repo-folders): device flow
  on, webhook off, organization permission **Custom properties: Admin**, repository **Metadata: Read-only**.
