# Security

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** (Security tab of this repository) rather than a public issue.

## What the extension can do

- It signs in through the **Repo Folders** GitHub App (device flow). A sign-in token only has the rights that
  both the app and you have: organization **Custom properties** (admin) and repository **Metadata** (read), and
  only in organizations where the app is installed. Members can read folders; only organization owners can
  change them.
- The token lives in the extension's service worker and storage. Content scripts, which run inside github.com's
  pages, never see it and cannot read the extension's storage. They can only ask the service worker to read the
  `folder` property or change it, and every request is checked against the page that sent it.
- It talks only to `github.com` and `api.github.com`. No server, no analytics.
- Your own account's folders don't use GitHub or the app at all: they live in the browser's synced storage.

## Know the limits

- **"Custom properties: Admin" covers every custom property of the organization**, not just `folder`; GitHub
  has no narrower permission. If your organization targets rulesets (branch protection) by custom property, a
  stolen or phished owner token could change those properties. The extension itself only ever touches `folder`.
- **Only enter a sign-in code that the Folders sidebar showed you.** The app's client ID is public, as it is for
  every device-flow app, so anyone can start a "Repo Folders" sign-in and ask you to enter their code at
  github.com/login/device. Entering it hands them your token.
- Signing out in the popup forgets the token on this computer. To revoke it on GitHub, use
  **Settings → Applications → Authorized GitHub Apps**. Tokens last 8 hours; the refresh token lasts 6 months.
- Firefox: storage locking (`setAccessLevel`) is not available in every version. Where it isn't, a content script
  could technically read the extension's storage; ours never reads tokens, and the token still never reaches
  web pages.
- The app has no private key and no client secret, and must keep it that way: whoever controls the app's owner
  account could otherwise act on every organization that installed it. Organization owners can uninstall the app
  at any time.

## Making sure it comes from us

- **Install only from the Chrome Web Store listing.** Chrome checks Google's signature on store packages and
  detects files changed on disk.
- **Uploads are signed with our own key** (Chrome Web Store verified uploads): the store rejects any update not
  signed with it, even from our own developer account.
- Release tags in this repository are signed; check for GitHub's **Verified** badge.

### Maintainers: signing setup

1. Create the key once, outside this repository, and keep it in a password manager or offline:
   `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out repo-folders-signing.pem`
2. Developer Dashboard → the item → **Package** → **Verified CRX uploads** → **Opt in**, and paste the output of
   `openssl rsa -in repo-folders-signing.pem -pubout`.
3. For each release: bump `version` in `manifest.json`, run `./pack.sh --crx path/to/repo-folders-signing.pem`,
   and upload `dist/repo-folders-<version>.crx`.

Losing the key means asking Chrome Web Store support to reset it, which can take a week. Never commit it
(`.gitignore` excludes `*.pem`) and don't store it in the Google account that owns the listing.
