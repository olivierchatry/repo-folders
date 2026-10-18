# Store listings

The same texts serve all three stores; `./pack.sh` builds the packages:

- **Chrome Web Store** (https://chrome.google.com/webstore/devconsole): `dist/repo-folders-<version>.zip`, or the
  signed `.crx` once verified uploads are on. Brave, Arc, Opera and Vivaldi install from here.
- **Microsoft Edge Add-ons** (https://partner.microsoft.com/dashboard/microsoftedge): the same `.zip`.
- **Firefox Add-ons** (https://addons.mozilla.org/developers/): `dist/repo-folders-<version>-firefox.zip`. The
  data collection Firefox shows at install comes from the manifest: authentication information (the GitHub
  sign-in token) and website content (repository and folder names), both sent only to GitHub.

## Store listing

**Name:** Repo Folders for GitHub (from the manifest)

**Summary** (132 characters max, from the manifest description):
Organize your GitHub repositories into folders: shared with your organization, or private for your own account.

**Category:** Developer Tools · **Language:** English

**Description:**

Folders for your GitHub repositories, right in GitHub's own repository lists.

• A Folders tree appears in the left sidebar of github.com/orgs/<your-org>/repositories.
• Your own account gets private folders too, above the list on your profile's Repositories tab.
• Click a folder to filter GitHub's list to it; click Unfiled to see repositories without a folder.
• Drag a repository from the list onto a folder to move it.
• Create, rename, nest and delete folders inline.

Folders are shared: they are stored in your organization on GitHub (as a "folder" custom property), so every
member sees the same tree, and GitHub's own search understands them (props.folder:"Team/Project").

Getting started:
1. Open your organization's Repositories page and click "Sign in with GitHub" in the Folders section.
2. If the Repo Folders app isn't installed on the organization yet, an organization owner installs it from the
   link shown there.
Members can browse folders; organization owners can change them. Your own account's folders need no sign-in:
they are kept in your browser's synced storage.

No server, no tracking: the extension talks only to GitHub.

**Icon:** icons/icon128.png · **Screenshots:** store/screenshot-1-folder-view.png, store/screenshot-2-new-folder.png,
store/screenshot-3-dark.png (1280×800, demo data on the public nanosvg organization, real sidebar code)
**Homepage URL:** https://github.com/olivierchatry/repo-folders
**Support URL:** https://github.com/olivierchatry/repo-folders/issues

## Privacy practices

**Single purpose:** Organize GitHub repositories into folders on github.com: shared folders for an organization's
repositories, private folders for your own account's.

**Permission justifications:**
- `storage`: keeps the GitHub sign-in token and a cached copy of the folder tree on the user's computer (the
  service worker locks it so page scripts cannot read it), and your own account's folders in synced storage.
- Host permission `https://github.com/*`: the service worker signs in through GitHub's device flow
  (`github.com/login/device/code`, `github.com/login/oauth/access_token`), which has no CORS support.
- Content script on `https://github.com/*`: adds the Folders section to GitHub's repository list pages, which
  GitHub loads without full page reloads, so the script must be present on all github.com pages.

**Remote code:** No, all code is in the package.

**Data usage:** collects "Authentication information" (GitHub token) and "Website content" (repository names and
folder names of the organization, cached locally). Check: not sold to third parties; not used for purposes
unrelated to the item's single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** https://github.com/olivierchatry/repo-folders/blob/main/PRIVACY.md

## Distribution

Visibility: Public (or Unlisted to share by link only). Regions: all.
