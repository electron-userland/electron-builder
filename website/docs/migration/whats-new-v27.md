---
title: "What's New in v27"
---

# What's New in v27

electron-builder **v27** is a major release: it moves the entire ecosystem to **native ES modules**, raises the minimum runtime to **Node.js 22.12.0**, adds several new capabilities, and quietly changes a handful of defaults. This page is the front door — a short tour of what's new, plus the silent behavior changes most likely to trip you up.

:::tip[Upgrading an existing project?]
Run `electron-builder migrate-schema` to auto-apply the config-key changes; the [table below](#new-defaults-and-behavior-changes-you-may-trip-over) is what it does **not** do for you. For the ordered upgrade steps, follow the [v26 → v27 walkthrough](./v26-to-v27.md); for the full catalogue of everything that changed, see [v27 Breaking Changes](./v27-breaking-changes.md).
:::

## New in v27

- **[MSIX target (beta)](../msix.md)** — a `win.target: "msix"` alongside AppX, producing `.msix` / `.msixbundle` / `.msixupload` artifacts with modern manifest features (Package Integrity, Windows Services). Purely additive; the default `winCodeSign` toolset is MSIX-capable.
- **[Cloudflare R2 publish provider](../publish.md#r2)** — an opt-in, S3-compatible `provider: "r2"` target with matching electron-updater support. Credentials come from `CF_R2_ACCESS_KEY_ID` / `CF_R2_SECRET_ACCESS_KEY`.
- **[Windows PKCS#11 & HSM code signing](../features/code-signing/code-signing-win.md)** — two new `win.sign` modes (beta): `pkcs11` (cross-platform via `osslsigncode` — sign Windows apps from macOS/Linux CI with no Windows VM) and `hsm` (Windows CSP / FIPS token).
- **[DMG `ULMO` / LZMA format](../dmg.md#disk-image-format)** — a new `dmg.format: "ULMO"` for LZMA-compressed images (macOS 10.15+), typically ~30% smaller than the default `UDZO`. Additive; the default format is unchanged.
- **[electron-updater `allowUnverifiedLinuxPackages`](../features/auto-update.md)** — a new `AppUpdater` flag to enforce GPG signature checks when installing `.deb` / `.rpm` auto-updates. Additive; defaults to `true` (historical behavior).
- **[`migrate-schema` CLI](../cli.md)** — a new command that rewrites your v26 config to v27 form in place, covering both static (`json`/`json5`/`yaml`/`package.json`) and programmatic (`.js`/`.ts`/`.cjs`/`.mjs`) configs.
- **[Native ESM + Node.js >=22.12](./v27-breaking-changes.md#native-esm-output)** — every package now ships as native ES modules. On Node.js 22.12.0+ both `import` and CJS `require()` continue to work with no code changes.

## New defaults and behavior changes you may trip over

These are the runtime and default changes that `migrate-schema` **does not** rewrite for you — no config key changed, so the migrator can't see them. Skim the list; each row deep-links to the full explanation.

| Change | One-line impact | Details |
|---|---|---|
| **Node.js >=22.12.0 required** | The build fails on older Node — bump your local runtime, CI, and Docker images. | [→](./v27-breaking-changes.md#nodejs-22120-required) |
| **Toolsets resolve to `"latest"`** | Unset / `null` / `"latest"` now fetch the newest bundle (Wine 11, winCodeSign 1.3.0, FUSE3 AppImage, NSIS 3.12); pin `"0.0.0"` to restore a legacy bundle. | [→](./v27-breaking-changes.md#toolset-defaults-resolve-to-latest-newest-bundle) |
| **`node_modules` arch/os-filtered every build** | Dependencies whose `cpu` / `os` mismatch the target are now excluded from the app (was effectively universal-macOS only). | [→](./v27-breaking-changes.md#node_modules-are-now-archos-filtered-on-every-build) |
| **`arch: "all"` -> x64 + arm64** | `"all"` no longer includes `ia32` — request `ia32` explicitly. Windows `ia32` / Linux `armv7l` fail fast on Electron 44+. | [→](./v27-breaking-changes.md#arch-all-now-expands-to-x64-and-arm64-32-bit-fails-fast-on-electron-44) |
| **`electron` / `electron-builder` excluded from `node_modules`** | Listing them in `dependencies` no longer errors — they're dropped from the copied `node_modules`; tune the set via `ignoredProductionDependencies`. | [→](./v27-breaking-changes.md#redundant-production-dependencies-are-excluded-not-rejected) |
| **DMG `filesystem` defaults to APFS** | New images use APFS (was HFS+); set `dmg.filesystem: "HFS+"` only for pre-10.13 macOS compatibility. | [→](./v27-breaking-changes.md#dmg-filesystem-defaults-to-apfs) |
| **`disableWebInstaller` defaults to `true`** | electron-updater warns now (v27) and blocks in v28 for NSIS web-installer updates unless you opt in with `disableWebInstaller: false`. | [→](./v27-breaking-changes.md#disablewebinstaller-defaults-to-true) |
| **`latest*.yml` drops top-level `path`/`sha512`** | Update metadata now carries only `files[]`; read `info.files[0]` and set `electronUpdaterCompatibility` if you still ship pre-2.16 updaters. | [→](./v27-breaking-changes.md#latestyml-drops-legacy-top-level-pathsha512) |
| **Bitbucket token without username -> Bearer auth** | A `BITBUCKET_TOKEN` with no username is now sent as Bearer; set `BITBUCKET_USERNAME` if it's an app password / API token needing Basic auth. | [→](./v27-breaking-changes.md#bitbucket-cloud-publishing-token-without-username-uses-bearer-auth) |
| **macOS `productName` / `executableName` validated** | A name that would need filename sanitization now throws at build start instead of being silently rewritten. | [→](./v27-breaking-changes.md#macos-productname-and-executablename-are-validated-not-sanitized) |
| **NSIS file-association ProgID format changed** | Associations now register under a unique generated ProgID; update custom NSIS scripts that hard-code the old `name`/extension. | [→](./v27-breaking-changes.md#nsis-file-association-progid-format-changed) |
| **Linux `.desktop` runs a `*-launcher` script** | Every Linux target launches via a generated `<executableName>-launcher`; the `.desktop` `Exec` points at it. Update custom `.desktop` / AppArmor / MIME tooling. | [→](./v27-breaking-changes.md#linux-launcher-entrypoint) |
| **AppImage `--no-sandbox` only for legacy FUSE2** | With the default FUSE3 runtime, `--no-sandbox` is no longer auto-added; set `executableArgs: ["--no-sandbox"]` if you need it unconditionally. | [→](./v27-breaking-changes.md#linux-launcher-entrypoint) |
| **Azure Trusted Signing uses `signtool /dlib`** | The default winCodeSign 1.3.0 ships the ATS `dlib` payload, so ATS uses the faster path automatically; pin below 1.3.0 to force the legacy PowerShell path. | [→](./v27-breaking-changes.md#azure-trusted-signing-signtool-dlib-is-the-default) |

:::note
This is the short list of high-traffic surprises. For the complete, authoritative catalogue — including config-key renames the migrator **does** handle — see [v27 Breaking Changes](./v27-breaking-changes.md).
:::

