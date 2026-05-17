# GitHub Actions CI/CD

This guide shows how to build, sign, and publish Electron apps using GitHub Actions for all three platforms (macOS, Windows, Linux).

## Basic Concepts

- **Secrets** — store certificates, passwords, and API tokens in [GitHub repository secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) (Settings → Secrets and variables → Actions)
- **Matrix builds** — build for multiple platforms in parallel using a matrix strategy
- **`GH_TOKEN`** — the GitHub token electron-builder uses to upload release assets. Use `GITHUB_TOKEN` (provided automatically) or a PAT with `repo` scope

## Minimal Multi-Platform Workflow

This workflow builds for macOS, Windows, and Linux on every push to `main` and on version tags:

```yaml
name: Build and Release

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npx electron-builder --publish never
        env:
          # macOS signing
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
          # Windows signing
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.os }}
          path: dist/
```

## Publish on Tag Push

To publish GitHub releases automatically when you push a version tag (`v1.2.3`):

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Publish
        run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # macOS signing + notarization
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # Windows signing
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

The `--publish always` flag uploads artifacts to the GitHub release for the pushed tag. If no release exists, electron-builder creates a draft release.

## Draft Release Workflow

A common pattern is to publish a **draft** release on every tagged push, then manually promote it to a full release after reviewing:

```yaml
# In electron-builder.yml
publish:
  provider: github
  releaseType: draft
```

Then in GitHub: go to Releases → find the draft → click "Edit" → "Publish release".

## macOS Code Signing Setup

### Preparing the Certificate

```bash
# Export your Developer ID Application certificate from Keychain Access
# File → Export Items → save as .p12 with a password

# Encode to base64
base64 -i certificate.p12 | pbcopy   # copies to clipboard
```

Add to GitHub Secrets:
- `MAC_CSC_LINK` — the base64-encoded `.p12` content
- `MAC_CSC_KEY_PASSWORD` — the certificate password

### macOS Signing

Pass `CSC_LINK` and `CSC_KEY_PASSWORD` directly — electron-builder creates and manages a temporary keychain automatically:

```yaml
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build and notarize
        run: npx electron-builder --mac --publish always
        env:
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### macOS Secrets Reference

| Secret | How to Get |
|---|---|
| `MAC_CSC_LINK` | `base64 -i certificate.p12` |
| `MAC_CSC_KEY_PASSWORD` | The password you set when exporting the `.p12` |
| `APPLE_ID` | Your Apple ID email (developer account) |
| `APPLE_APP_SPECIFIC_PASSWORD` | Create at [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-character team ID from [developer.apple.com/account](https://developer.apple.com/account) |

## Windows Code Signing Setup

```bash
# Encode your Windows certificate (.pfx) to base64
# PowerShell:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | Out-File cert_encoded.txt

# bash (Linux/macOS):
base64 certificate.pfx > cert_encoded.txt
```

Add to GitHub Secrets:
- `WIN_CSC_LINK` — base64-encoded `.pfx` content
- `WIN_CSC_KEY_PASSWORD` — certificate password

### Using Azure Trusted Signing

```yaml
      - name: Build and sign (Azure)
        run: npx electron-builder --win --publish always
        env:
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Configure `win.azureSignOptions` in your electron-builder config. See [Windows Code Signing](./code-signing/code-signing-win.md#using-azure-trusted-signing-beta).

## Caching for Faster Builds

Cache npm packages and Electron binaries to avoid redundant downloads:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm    # caches ~/.npm

      - name: Cache Electron
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/electron
            ~/.cache/electron-builder
          key: ${{ runner.os }}-electron-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-electron-
```

## Linux Snapcraft Publishing

To publish to the Snap Store, add a `SNAPCRAFT_STORE_CREDENTIALS` secret (obtained by running `snapcraft export-login -`):

```yaml
      - name: Build and publish Snap
        run: npx electron-builder --linux snap --publish always
        env:
          SNAPCRAFT_STORE_CREDENTIALS: ${{ secrets.SNAPCRAFT_STORE_CREDENTIALS }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Complete Production Workflow

A production-grade workflow with separate jobs per platform, caching, and GitHub release publishing:

```yaml
name: Release

on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: write

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: actions/cache@v4
        with:
          path: ~/.cache/electron
          key: mac-electron-${{ hashFiles('**/package-lock.json') }}
      - run: npm ci
      - run: npx electron-builder --mac --publish always
        env:
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: actions/cache@v4
        with:
          path: ~\AppData\Local\electron
          key: win-electron-${{ hashFiles('**/package-lock.json') }}
      - run: npm ci
      - run: npx electron-builder --win --publish always
        env:
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: actions/cache@v4
        with:
          path: ~/.cache/electron
          key: linux-electron-${{ hashFiles('**/package-lock.json') }}
      - run: npm ci
      - run: npx electron-builder --linux --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Troubleshooting

**"Resource not accessible by integration"**
: The workflow doesn't have permission to create releases. Add `permissions: contents: write` to the job or workflow. Also ensure `GH_TOKEN` is set.

**macOS: "No identity found"**
: `CSC_LINK` or `CSC_KEY_PASSWORD` is wrong or missing. Verify the base64-encoded certificate decodes to a valid `.p12` and that the password is correct. Run `echo "$CSC_LINK" | base64 --decode | openssl pkcs12 -info -passin pass:"$CSC_KEY_PASSWORD"` locally to verify.

**Windows: certificate base64 too long**
: Windows CI environments may truncate environment variables over 8192 characters. Re-export the `.pfx` without the full certificate chain included. See [Code Signing](./code-signing/code-signing.md#encoding-a-certificate-for-ci).

**Build fails with "Cannot find module"**
: Native modules need to be rebuilt for the target Electron version. Ensure `npm ci` (not `npm install`) is used, and check that `electron-rebuild` or `@electron/rebuild` is configured if needed.

## Related Pages

- [Code Signing](./code-signing/code-signing.md) — environment variables, certificate types
- [macOS Notarization](./code-signing/notarization.md) — notarization setup and troubleshooting
- [Auto Update](./auto-update.md) — configuring electron-updater with GitHub releases
- [Multi Platform Build](./multi-platform-build.md) — building for other platforms using Docker
