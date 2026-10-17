# Repo Folders for GitHub

A Chrome extension that adds a **Folders** tree to the left sidebar of an organization's repository list
(`github.com/orgs/<org>/repositories`). Folders are stored in the organization itself, so every member sees
the same tree.

## Install

1. Install **Repo Folders for GitHub** from the Chrome Web Store.
2. Open your organization's Repositories page and click **Sign in with GitHub** in the Folders section. Enter the
   code it shows at github.com/login/device.
3. If the sidebar says the app isn't installed on the organization, an organization owner clicks **Install it**
   and installs the [Repo Folders app](https://github.com/apps/repo-folders) with **All repositories**.
   Members can request it from the same page.

One sign-in covers every organization where the app is installed. Members can browse folders; changing them
needs an organization owner. The popup (toolbar icon) shows whether you're signed in and lets you sign out.

What the app is allowed to do, and what to watch for, is in [SECURITY.md](SECURITY.md).

## Use

- **Click a folder** to filter GitHub's list to it (`props.folder:"Team/Project"`); **Unfiled** shows
  repositories without a folder (`no:props.folder`). The list updates in place, without a page reload.
- **Drag a repository** from GitHub's list onto a folder to move it there, or onto **Unfiled** to take it out.
- Hover a folder for **+** (new subfolder), **✎** (rename or move: edit the full path, e.g. `Old/X` → `New/X`)
  and **×** (delete after a confirmation; its repositories become unfiled).

## Where the folders live

- An organization **custom property** named `folder`, type *single select*. Its allowed values are the folder
  paths (`Backend`, `Backend/Services`, …), which is why empty folders can exist.
- Each repository's `folder` value is its folder; no value = unfiled.
- The first folder creates the property; deleting the last folder deletes it.

It is a normal custom property, so it also shows in repository settings, in `props.folder:` searches and in
the API (`GET /orgs/<org>/properties/values`). Limits from GitHub: organizations only (user accounts have no
custom properties), at most 200 folders counting every path, names in printable ASCII without `"`.

## Known limits

- Edits to the folder list are read-modify-write: two people changing folders in the same second can lose one
  change. Moving repositories has no such issue.
- Folder renames update repositories 30 at a time (API limit), so a big rename takes a few seconds.
- GitHub's search index sees a move about 3 seconds after it is saved: a repository dragged out of a folder
  view disappears from the list at once, but the list's repository count catches up a few seconds later.

## Develop

- Load it: `chrome://extensions` → **Developer mode** → **Load unpacked** → this folder. After a change, click
  the extension's reload icon there, then reload the GitHub tab.
- `node test.js` checks the folder path logic, that the content script starts, and that the service worker
  refuses requests from other pages, other organizations and crafted names without calling GitHub.
- `./pack.sh` builds `dist/repo-folders-<version>.zip`; `./pack.sh --crx key.pem` also builds the signed
  `.crx` that the Chrome Web Store requires once verified uploads are on (see [SECURITY.md](SECURITY.md)).
  `STORE.md` has the listing texts and `PRIVACY.md` the privacy policy. Bump `version` for each upload.
- `background.js` (service worker) holds the sign-in and makes every GitHub call; `content.js` only draws the
  sidebar and sends it requests, which `background.js` checks against the page that sent them.
- The GitHub App (`CLIENT_ID` in `background.js`) is [Repo Folders](https://github.com/apps/repo-folders): device flow
  on, webhook off, organization permission **Custom properties: Admin**, repository **Metadata: Read-only**.
