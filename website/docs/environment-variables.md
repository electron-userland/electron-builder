---
title: "Environment Variables"
---

# Environment Variables

electron-builder reads a handful of environment variables — almost all of them **secrets** (signing certificates, publish tokens) or **CI-provided** values (the release tag, repository slug). Everything else is configured through your [configuration file](./configuration.md), not the environment.

This page is a grouped reference for every environment variable electron-builder itself reads. For the deeper "how", each group links to the relevant guide.

:::warning[Upgrading from v26?]
Several environment variables were **removed in v27** — most notably `CI_BUILD_TAG` (use `CI_COMMIT_TAG`), `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY`, and every toolset-override variable (`USE_SYSTEM_WINE`, `ELECTRON_BUILDER_NSIS_DIR`, …). See [Removed in v27](#removed-in-v27) below and the [v27 breaking changes](./migration/v27-breaking-changes.md).
:::

---

## Code signing

Signing credentials are read from the environment so certificates and passwords never have to live in your config. **Never commit them to source control** — inject them via CI secrets. Each value accepts an HTTPS URL, a `file://` path, a local path, or a base64-encoded certificate string.

### Shared / macOS

| Variable | Description |
|---|---|
| `CSC_LINK` | The certificate (`.p12`/`.pfx`) — HTTPS URL, `file://` path, local path, or base64 string. |
| `CSC_KEY_PASSWORD` | Password that decrypts the certificate at `CSC_LINK`. |

### macOS installer (PKG)

| Variable | Description |
|---|---|
| `CSC_INSTALLER_LINK` | Certificate for signing PKG installers (a Developer ID **Installer** certificate). |
| `CSC_INSTALLER_KEY_PASSWORD` | Password for the installer certificate. |

### Windows

| Variable | Description |
|---|---|
| `WIN_CSC_LINK` | Windows certificate. Falls back to `CSC_LINK` if unset. |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows certificate. Falls back to `CSC_KEY_PASSWORD` if unset. |

:::tip[Cross-compiling Windows on macOS]
Use `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` to supply a separate Windows certificate while keeping your macOS certificate in `CSC_LINK` / `CSC_KEY_PASSWORD`.
:::

:::note[More signing variables]
The macOS keychain/identity variables (`CSC_NAME`, `CSC_IDENTITY_AUTO_DISCOVERY`, `CSC_KEYCHAIN`) and Azure Trusted Signing variables (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`) are documented in the code-signing guides: [Code Signing](./features/code-signing/code-signing.md), [macOS](./features/code-signing/code-signing-mac.md), and [Windows](./features/code-signing/code-signing-win.md). In v27, `WIN_CSC_LINK` fallback applies only to `signtool` mode; `hsm`, `pkcs11`, and `azure` are configured through [`win.sign`](./migration/v27-breaking-changes.md#windows-signing--winsign).
:::

## Notarization (macOS)

For notarizing macOS apps distributed outside the Mac App Store. Provide **one** of the three credential sets. Full setup is in the [Notarization guide](./features/code-signing/notarization.md).

| Variable | Description |
|---|---|
| `APPLE_ID` | Apple ID email (Apple-ID auth). |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID. |
| `APPLE_TEAM_ID` | Apple Developer Team ID. |
| `APPLE_API_KEY` | Path to the App Store Connect API key (`.p8`). |
| `APPLE_API_KEY_ID` | Key ID for the App Store Connect API key. |
| `APPLE_API_ISSUER` | Issuer ID for the App Store Connect API key. |
| `APPLE_KEYCHAIN` | Keychain to search for a stored notarization profile. |
| `APPLE_KEYCHAIN_PROFILE` | Name of a `notarytool` keychain profile to use. |

---

## Publishing

Publish providers read their credentials from the environment. Publishing is **never** automatic — you must pass `--publish` explicitly (see [Publish](./publish.md)).

### GitHub

| Variable | Description |
|---|---|
| `GH_TOKEN` / `GITHUB_TOKEN` | GitHub token. If either is defined, publishing defaults to `[{ provider: "github" }]`. |
| `GITHUB_RELEASE_TOKEN` | If defined, used **instead of** `GH_TOKEN`/`GITHUB_TOKEN` to publish the release (so you can keep a read-only token for update checks and a read-write token for releasing). |

### GitLab

| Variable | Description |
|---|---|
| `GITLAB_TOKEN` | GitLab token. Required to publish to the `gitlab` provider. |

### Bitbucket

| Variable | Description |
|---|---|
| `BITBUCKET_TOKEN` | Bitbucket token. Required to publish to the `bitbucket` provider. |
| `BITBUCKET_USERNAME` | Bitbucket username / Atlassian account email — selects the auth scheme (see below). |

:::warning[v27 auth change]
In v27 the Bitbucket publisher selects its auth scheme by whether a username is present:

- **`BITBUCKET_USERNAME` set** → HTTP **Basic** auth. Use this for an **app password** or an Atlassian **API token**.
- **No username** → the token is sent as `Authorization: Bearer <token>` (a repository / project / workspace **access token**).

If `BITBUCKET_TOKEN` holds an app password or API token, you **must** also set `BITBUCKET_USERNAME`. See [the breaking-change note](./migration/v27-breaking-changes.md#bitbucket-cloud-publishing-token-without-username-uses-bearer-auth).
:::

### Keygen

| Variable | Description |
|---|---|
| `KEYGEN_TOKEN` | Keygen token. If defined (and no GitHub token is), publishing defaults to `[{ provider: "keygen" }]`. |

### Cloudflare R2

| Variable | Description |
|---|---|
| `CF_R2_ACCESS_KEY_ID` | R2 access key ID (an R2 API token with Object Read & Write). |
| `CF_R2_SECRET_ACCESS_KEY` | R2 secret access key. |

### Amazon S3

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS access key ID. |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key. |
| `AWS_SESSION_TOKEN` | Optional session token for temporary credentials. |
| `AWS_PROFILE` | Named profile in `~/.aws/credentials` to use when the keys above are not set (default: `default`). |

### DigitalOcean Spaces

| Variable | Description |
|---|---|
| `DO_KEY_ID` | Spaces access key ID. |
| `DO_SECRET_KEY` | Spaces secret access key. |

### Snap Store

| Variable | Description |
|---|---|
| `SNAP_CSC_LINK` | Base64-encoded Snap Store credentials or a file path (the CI-friendly equivalent of `snapcraft.cscLink`). Used for Snap Store publishing and Launchpad remote builds. |
| `SNAPCRAFT_STORE_CREDENTIALS` | Plain-text macaroon, read directly by `snapcraft`. |

See [Snap → Authentication](./snap.md#authentication) for the credential resolution order.

---

## CI & release tags

electron-builder detects the release tag and repository from standard CI variables. These are normally **set by your CI provider**, not by you — the exception is `CI_COMMIT_TAG`, which you can set manually (e.g. on GitLab or self-hosted CI) to provide the tag.

| Variable | Description |
|---|---|
| `CI_COMMIT_TAG` | The release tag (GitLab's standard variable). Set this manually where no other tag variable is present. |
| `TRAVIS_TAG` | Tag on Travis CI. |
| `APPVEYOR_REPO_TAG_NAME` | Tag on AppVeyor. |
| `CIRCLE_TAG` | Tag on CircleCI. |
| `BITRISE_GIT_TAG` | Tag on Bitrise. |
| `BITBUCKET_TAG` | Tag on Bitbucket Pipelines. |
| `GITHUB_REF_TYPE` / `GITHUB_REF_NAME` | On GitHub Actions, the tag is taken from `GITHUB_REF_NAME` when `GITHUB_REF_TYPE` is `tag`. |

The GitHub repository is auto-detected from `TRAVIS_REPO_SLUG`, `APPVEYOR_REPO_NAME`, or `CIRCLE_PROJECT_USERNAME`/`CIRCLE_PROJECT_REPONAME` (falling back to your `package.json` `repository` field or `.git/config`).

:::warning[`CI_BUILD_TAG` removed in v27]
`CI_BUILD_TAG` was **removed** — use `CI_COMMIT_TAG` instead. See [the breaking-change note](./migration/v27-breaking-changes.md#ci_build_tag-environment-variable).
:::

---

## Cache & download

| Variable | Description |
|---|---|
| `ELECTRON_BUILDER_CACHE` | Overrides the cache directory used for downloaded Electron binaries and toolsets. Must be an **absolute** path. Defaults to `~/Library/Caches/electron-builder` (macOS), `%LOCALAPPDATA%` (Windows), or `$XDG_CACHE_HOME` / `~/.cache` (Linux). |
| `USE_HARD_LINKS` | Set to `"true"` to copy files via hard links where possible (faster, less disk use). Ignored on Windows. |

:::note[Electron mirror is config, not an env var]
To download Electron from a mirror, configure [`electronGet.mirrorOptions`](./migration/v27-breaking-changes.md#electrondownload--electronget) in your build config — e.g. `electronGet: { mirrorOptions: { mirror: "https://my-mirror/" } }`. (In v26 this was `electronDownload.mirror`.) See [Configuration](./configuration.md).
:::

---

## Debugging

| Variable | Description |
|---|---|
| `DEBUG=electron-builder` | Enables verbose debug logging via the [`debug`](https://www.npmjs.com/package/debug) package. |

```bash
DEBUG=electron-builder electron-builder --linux snap
```

Namespaced channels are also available — e.g. `DEBUG=electron-builder:7z` for archive operations, or `DEBUG=electron-builder*` for everything.

---

## Removed in v27

These variables were removed in v27. `electron-builder migrate-schema` does **not** rewrite them — update your scripts and config manually.

| Removed variable | Replacement |
|---|---|
| `CI_BUILD_TAG` | [`CI_COMMIT_TAG`](#ci--release-tags) |
| `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` | The [`ignoredProductionDependencies`](./configuration.md) build option — see the [breaking-change note](./migration/v27-breaking-changes.md#redundant-production-dependencies-are-excluded-not-rejected). |

### Toolset overrides

The environment variables that pointed electron-builder at custom build-tool bundles are **all removed**. Supply a custom bundle through a [`ToolsetCustom`](./migration/v27-breaking-changes.md#toolset-env-var-overrides-removed) object on the relevant `toolsets` key instead (`toolsets.<name>: { url, checksum }`).

| Removed variable | What it controlled |
|---|---|
| `USE_SYSTEM_WINE` | Forced host-installed Wine instead of the bundle. |
| `USE_SYSTEM_SIGNCODE` | Forced host `signtool`/`signcode`. |
| `USE_SYSTEM_OSSLSIGNCODE` | Forced host `osslsigncode`. |
| `USE_SYSTEM_FPM` | Forced host-installed `fpm`. |
| `APPIMAGE_TOOLS_PATH` | AppImage build tools (`mksquashfs`, runtime). |
| `LINUX_TOOLS_MAC_PATH` | Linux-tools-mac bundle (`ar`, `lzip`, `gtar`). |
| `CUSTOM_FPM_PATH` | FPM executable. |
| `ELECTRON_BUILDER_NSIS_DIR` | NSIS compiler bundle directory. |
| `ELECTRON_BUILDER_NSIS_RESOURCES_DIR` | NSIS resources/plugins directory. |
| `CUSTOM_NSIS_RESOURCES` | Alternate NSIS resources bundle. |
| `ELECTRON_BUILDER_WINE_TOOLSET_DIR` | Wine bundle directory. |

The three signing `USE_SYSTEM_*` variables have **no env-var replacement** — configure signing through [`win.sign`](./migration/v27-breaking-changes.md#windows-signing--winsign) and the `winCodeSign` toolset. For the full replacement mechanics (archive formats, checksums, `file://` directories), see [Toolset env-var overrides removed](./migration/v27-breaking-changes.md#toolset-env-var-overrides-removed).

