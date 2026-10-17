# Chrome Web Store listing

Copy these into the Developer Dashboard (https://chrome.google.com/webstore/devconsole) when uploading
`dist/repo-folders-<version>.zip` from `./pack.sh`.

## Store listing

**Name:** Repo Folders for GitHub (from the manifest)

**Summary** (132 characters max, from the manifest description):
Organize an organization's GitHub repositories into folders that every member of the organization sees.

**Category:** Developer Tools · **Language:** English

**Description:**

Folders for your organization's GitHub repositories, right in GitHub's own repository list.

• A Folders tree appears in the left sidebar of github.com/orgs/<your-org>/repositories.
• Click a folder to filter GitHub's list to it; click Unfiled to see repositories without a folder.
• Drag a repository from the list onto a folder to move it.
• Create, rename, nest and delete folders inline.

Folders are shared: they are stored in your organization on GitHub (as a "folder" custom property), so every
member sees the same tree, and GitHub's own search understands them (props.folder:"Team/Project").

Getting started:
1. Open your organization's Repositories page and click "Sign in with GitHub" in the Folders section.
2. If the Repo Folders app isn't installed on the organization yet, an organization owner installs it from the
   link shown there.
Members can browse folders; organization owners can change them.

No server, no tracking: the extension talks only to GitHub.

**Icon:** icons/icon128.png · **Screenshots:** store/screenshot-1-folder-view.png, store/screenshot-2-new-folder.png,
store/screenshot-3-dark.png (1280×800, demo data on the public nanosvg organization, real sidebar code)
**Homepage URL:** https://github.com/olivierchatry/repo-folders
**Support URL:** https://github.com/olivierchatry/repo-folders/issues

## Privacy practices

**Single purpose:** Show an organization's GitHub repositories in shared folders on github.com and let members
move repositories between folders.

**Permission justifications:**
- `storage`: keeps the GitHub sign-in token and a cached copy of the folder tree on the user's computer; the
  service worker locks it so page scripts cannot read it.
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
