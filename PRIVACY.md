# Privacy policy: Repo Folders for GitHub

Repo Folders for GitHub is a browser extension that shows an organization's repositories in folders on github.com.

**What it reads and stores**

- Your GitHub sign-in: the access token from the "Repo Folders" GitHub App. It is kept in your browser's
  extension storage on your computer only, where web pages (github.com included) cannot read it.
- A copy of each organization's folder tree and repository names, cached in the same storage so the sidebar
  appears instantly. Signing out from the popup deletes the token and these copies.
- Your own account's folders (folder names and the names of the repositories in them), kept in your browser's
  synced storage. Your browser's sync (Chrome Sync, Firefox Sync) carries them to your other devices; they are
  never sent to GitHub or anyone else.

**Where data goes**

The extension talks only to GitHub (`github.com` and `api.github.com`), using your token, to read and change the
organization's `folder` custom property. Folders are stored in the organization on GitHub, where every member can
see them. Nothing is sent to the extension's author or to any other service. There is no analytics, no tracking
and no advertising, and no data is sold or shared.

**Revoking access**

Sign out from the extension's popup, and revoke the app under GitHub **Settings → Applications → Authorized
GitHub Apps**. Uninstalling the extension removes all of its local data.

Contact: open an issue at https://github.com/olivierchatry/repo-folders/issues
