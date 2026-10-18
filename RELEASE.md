# Releasing

All commands run from the repository root.

## One-time setup

### Signed git tags (SSH signing)

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_rsa.pub
git config --global tag.gpgsign true
git config --global commit.gpgsign true   # optional: sign every commit too
```

Let git verify signatures locally:

```bash
echo "$(git config user.email) $(cat ~/.ssh/id_rsa.pub)" >> ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

Register the key on GitHub as a **signing** key (the commit email must be a verified email on the account):

```bash
gh auth refresh -h github.com -s admin:ssh_signing_key
gh ssh-key add ~/.ssh/id_rsa.pub --type signing --title "git signing"
```

### Chrome Web Store

1. Register as a developer at https://chrome.google.com/webstore/devconsole ($5; the Google account needs
   2-step verification).
2. Create the upload signing key **outside the repository** and back it up in a password manager (losing it
   means a support request that can take a week):

   ```bash
   mkdir -p ~/keys && chmod 700 ~/keys
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ~/keys/repo-folders-signing.pem
   chmod 600 ~/keys/repo-folders-signing.pem
   ```

### Firefox Add-ons and Edge Add-ons

1. Firefox: create an account on https://addons.mozilla.org/developers/ (free). For uploads from the terminal,
   create API credentials under **Tools → Manage API Keys** and keep them in your password manager.
2. Edge: register at https://partner.microsoft.com/dashboard/microsoftedge (free). Brave, Arc, Opera and Vivaldi
   need nothing: they install from the Chrome Web Store.

## First release (1.0.0)

1. Bump the version and build (runs the tests, writes `dist/repo-folders-1.0.0.zip` and `.crx`):

   ```bash
   sed -i '' 's/"version": "[^"]*"/"version": "1.0.0"/' manifest.json
   ./pack.sh --crx ~/keys/repo-folders-signing.pem
   ```

2. Commit, sign the tag, push:

   ```bash
   git commit -am "chore: release 1.0.0"
   git tag -s v1.0.0 -m "Repo Folders 1.0.0"
   git tag -v v1.0.0
   git push --follow-tags
   ```

3. Optional GitHub release with a checksum:

   ```bash
   shasum -a 256 dist/repo-folders-1.0.0.zip
   gh release create v1.0.0 dist/repo-folders-1.0.0.zip --title "Repo Folders 1.0.0" --notes "First Chrome Web Store release."
   ```

4. Developer Dashboard → **New item** → upload `dist/repo-folders-1.0.0.zip` (the zip for this very first
   upload). Fill in from [STORE.md](STORE.md):
   - **Store listing**: description, category Developer Tools, language English, screenshots
     `store/screenshot-*.png`, icon `icons/icon128.png`.
   - **Privacy practices**: single purpose, permission justifications, data usage, privacy policy URL
     `https://github.com/olivierchatry/repo-folders/blob/main/PRIVACY.md`.
   - **Distribution**: Public (or Unlisted).
5. **Package → Verified CRX uploads → Opt in**, and paste the public key:

   ```bash
   openssl rsa -in ~/keys/repo-folders-signing.pem -pubout
   ```

6. **Submit for review.**
7. Once approved, link the store listing in [README.md](README.md) (Install, step 1), then commit and push.

## Every later release

```bash
sed -i '' 's/"version": "[^"]*"/"version": "X.Y.Z"/' manifest.json
./pack.sh --crx ~/keys/repo-folders-signing.pem
npx web-ext lint --source-dir dist/firefox
git commit -am "chore: release X.Y.Z"
git tag -s vX.Y.Z -m "Repo Folders X.Y.Z"
git push --follow-tags
```

Then upload to each store:

- **Chrome Web Store**: `dist/repo-folders-X.Y.Z.crx` (with verified uploads on, the store rejects zips and
  anything not signed with the key).
- **Edge Add-ons**: `dist/repo-folders-X.Y.Z.zip` (Partner Center → the extension → **Update**).
- **Firefox Add-ons**: `dist/repo-folders-X.Y.Z-firefox.zip` on the add-on's page, or from the terminal (Mozilla
  reviews and signs it):

  ```bash
  npx web-ext sign --source-dir dist/firefox --channel listed --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
  ```

  The first Firefox submission needs the listing texts from [STORE.md](STORE.md) and a source-code link; point it to
  this repository (the add-on ships unminified files, so no build instructions are needed).

## Optional

- App logo: `rsvg-convert -w 512 -h 512 icons/icon.svg -o ~/Desktop/repo-folders-logo.png`, then upload it at
  https://github.com/settings/apps/repo-folders → **Display information**.
- Require signed commits on `main`: repository **Settings → Rules → New branch ruleset**, target `main`, enable
  **Require signed commits**.
