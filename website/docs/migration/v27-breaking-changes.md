---
title: "v27 Breaking Changes"
---

# v27 Breaking Changes

:::danger[Read this before upgrading to v27]
v27 moves the entire electron-builder ecosystem to **native ES modules**, raises the minimum runtime to **Node.js 22.12.0**, and **hard-deletes the deprecated APIs** that accumulated since v22. Every breaking change in the release is catalogued in this section.

**Most projects need only a Node.js bump plus one command.** Run the automated migrator and follow the step-by-step **[migration walkthrough →](./v26-to-v27)**.
:::

This section is the **canonical reference for _what_ changed** in v27. For the **_how_ — the ordered upgrade steps, the automated migrator, and the checklist** — see the [v26 → v27 migration walkthrough](./v26-to-v27). New, additive features are listed on [What's New in v27](./whats-new-v27.md).

- The `build()` API is unchanged; configuration keys that were renamed or restructured are rewritten automatically by `migrate-schema` and keep their v26 behavior, and exported types that survive keep their shape.
- CJS `require()` continues to work without code changes on supported Node.js versions.
- Every **config-level** breaking change that has a mechanical v27 equivalent is rewritten automatically by `electron-builder migrate-schema` (look for the **Auto** ✓ marker on the [Config page](./v27-config-changes.md)). The config keys it cannot rewrite, [`squirrelWindows.customSquirrelVendorDir`](./v27-config-changes.md#squirrelwindowscustomsquirrelvendordir) and a custom NSIS bundle in [`nsis.customNsisBinary` / `customNsisResources`](./v27-config-changes.md#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis), are reported with a warning. Runtime, CLI, env-var, and behavior changes require manual action — see [what `migrate-schema` does and does not do](#new-command-migrate-schema).

:::tip[Run the automated migrator first]
```bash
electron-builder migrate-schema            # apply changes in place
electron-builder migrate-schema --dry-run  # preview only
```
This handles every change marked **Auto ✓** on the [Config page](./v27-config-changes.md). See the [walkthrough](./v26-to-v27#step-1-run-the-automated-migrator) for flags and serialization caveats.
:::

---

## Breaking changes at a glance

The changes are split by where you fix them. Each page opens with its own at-a-glance table, and each entry says how the build tells you about it.

| Page | What's on it | Changes |
|---|---|:---:|
| **[Config](./v27-config-changes.md)** | Removed, renamed and restructured config keys. `migrate-schema` rewrites most of them; any left behind fail the build. | 25 |
| **[Build & Publish](./v27-build-changes.md)** | Node.js and CLI, toolsets and environment variables, dependency collection and validation, signing checks, publishing and update metadata, Flatpak build tooling. | 31 |
| **[Runtime (Shipped App)](./v27-runtime-changes.md)** | What changes on users' machines: auto-update defaults and the electron-updater API, macOS entitlements and DMG, NSIS file associations, the Linux launcher, Flatpak and Snap defaults. | 21 |
| **[Developer-Only](./v27-developer-changes.md)** | Only if you write code against electron-builder: ESM packaging, the programmatic and plugin APIs, build hooks and custom signers, custom NSIS and maintainer scripts, type exports. | 10 |

---

## How v27 tells you about breaking changes {#how-v27-announces-breaking-changes}

Most v27 breaking changes announce themselves when a build runs into them:

- **Removed or moved config keys** fail the build with one error that lists each key, its replacement and a link to its section.
- **Most build and publish changes** fail the build or log a warning with a link to their section: missing dependencies, mismatched native binaries, removed environment variables, signing-key and publisher checks, Flatpak and Snap defaults, and more.
- **Some runtime defaults** get an advisory from `migrate-schema` (`nsis-web` installers, per-machine NSIS builds, macOS entitlements, feed URLs with a query string), and electron-updater logs a warning when app code uses a changed API.

The quickest way through an upgrade is:

1. Run `migrate-schema`.
2. Run a normal build.
3. Run a **publishing** build: the signing-key, S3 and update-feed checks only run when publishing.
4. Follow the links in any errors or warnings.
5. Check the list below: those changes won't tell you.

## Changes that won't tell you {#changes-that-wont-tell-you}

### Silent {#silent}

| Change | Affects you if | Page |
|---|---|---|
| [DMG `filesystem` defaults to APFS](./v27-runtime-changes.md#dmg-filesystem-defaults-to-apfs) | You support macOS older than 10.13 (High Sierra) | Runtime |
| [`http-parser` dropped from the default pacman `depends`](./v27-runtime-changes.md#pacman-default-dependencies-changed) | Your Arch package relies on `http-parser` | Runtime |
| [Linux targets launch through a `*-launcher` script; AppImage adds `--no-sandbox` only for the legacy FUSE2 runtime](./v27-runtime-changes.md#linux-launcher-entrypoint) | You ship a custom `.desktop` file, AppArmor profile or MIME handler, or need the Chromium sandbox off in an AppImage | Runtime |
| [Windows update signature verification fails closed](./v27-runtime-changes.md#windows-update-signature-verification-fails-closed) | Your users' machines may block PowerShell (AppLocker / WDAC), or your update installers are catalog-signed. Updates fail only on those machines | Runtime |
| [The `nsis-web` installer verifies its app package](./v27-runtime-changes.md#disablewebinstaller-defaults-to-true) | You run one web installer with a `--package-file` from another build | Runtime |
| [`verifyUpdateCodeSignature` renamed (shim until v28)](./v27-runtime-changes.md#verifyupdatecodesignature-renamed-to-verifyupdatefileauthenticodesignature) | Your app sets `verifyUpdateCodeSignature`, or a subclass redeclares `_verifyUpdateCodeSignature` | Runtime |
| [macOS names are no longer NFD-normalized](./v27-build-changes.md#macos-productname-and-executablename-are-validated-not-sanitized) | Your product name has accented characters and external tooling matches the bundle filename | Build |
| [An empty GitHub `tagNamePrefix` is honored](./v27-config-changes.md#githuboptions-gitlaboptions-vprefixedtagname) | You set `tagNamePrefix: ""` (v26 still tagged `v1.2.3`) | Config |
| [`npm run release` no longer publishes](./v27-build-changes.md#implicit-publish-on-npm-run-release-removed) | Your release script relied on its name to publish | Build |
| [The embedded update feed follows target-level `publish`](./v27-build-changes.md#app-updateyml-feed-follows-the-update-writing-targets) | You set `publish` on a target (e.g. `nsis.publish`), or the first provider has `publishAutoUpdate: false` | Build |
| [`latest*.yml` drops the top-level `path` / `sha512`](./v27-build-changes.md#latestyml-drops-legacy-top-level-pathsha512) | App code or tooling reads `info.path` / `info.sha512`, or you still ship electron-updater 2.15 or older | Build |
| [NSIS `customInstallMode` macro guard casing](./v27-developer-changes.md#nsis-custominstallmode-macro-guard-casing-corrected) | Your custom NSIS script defines `customInstallmode` (lowercase `m`) | Developer |

### Info log only {#info-log-only}

| Change | Affects you if | Page |
|---|---|---|
| [Toolsets resolve to `"latest"`; Wine is the host install](./v27-build-changes.md#toolset-defaults-resolve-to-latest-newest-bundle) | You build Windows targets on macOS (install Wine), or need a legacy bundle | Build |
| [Azure Trusted Signing uses `signtool /dlib`](./v27-build-changes.md#azure-trusted-signing-signtool-dlib-is-the-default) | You need the legacy PowerShell signing path | Build |
| [`node_modules` are filtered by `cpu` / `os` on every build](./v27-build-changes.md#node_modules-are-now-archos-filtered-on-every-build) | You bundle a cross-arch or cross-OS optional binary on purpose | Build |
| [`electron` / `electron-builder` are excluded from the copied `node_modules`](./v27-build-changes.md#redundant-production-dependencies-are-excluded-not-rejected) | You need `electron-builder` inside the app | Build |

### Silent in the common case {#silent-in-the-common-case}

| Change | Affects you if | Page |
|---|---|---|
| [macOS default entitlements drop `allow-unsigned-executable-memory`](./v27-runtime-changes.md#macos-default-entitlements-tightened) | Your app needs that entitlement. Only the library-validation part gets a build warning | Runtime |
| [S3 publishing needs `awsCredentials.source`](./v27-build-changes.md#s3-publishing-requires-an-explicit-awscredentialssource) | You publish to S3. Builds that don't publish don't check it | Build |
| [macOS: the ASAR integrity digest is embedded](./v27-runtime-changes.md#macos-asar-integrity-digest) | You merge separately built x64 and arm64 apps with `@electron/universal` yourself. The build only warns when you have an `afterPack` hook | Runtime |

---

## What `migrate-schema` covers {#new-command-migrate-schema}

v27 adds `electron-builder migrate-schema`, which rewrites your config to v27 form in place and auto-migrates **static** (`json`/`json5`/`yaml`/package.json) **and programmatic** (`.js`/`.ts`/`.cjs`/`.mjs`) configs. TOML configs are parsed and the required changes printed, but not written. See the [walkthrough](./v26-to-v27#step-1-run-the-automated-migrator) for flags and the before/after of every rewrite.

**It rewrites** every entry marked **Auto ✓** on the [Config page](./v27-config-changes.md): removed keys (`electronCompile`, `framework`/`nodeVersion`/`launchUiVersion`, `disableDefaultIgnoredFiles`, `appImage.systemIntegration`, `linux.syncDesktopName`, `mac.gatekeeperAssess`), the `nativeModules`, `asar` (root and platform-level), `fileOptions` (root and platform-level), `mac.sign`, `mac.universal`, `win.sign`, `electronGet`, and `snapcraft` restructurings, GitHub `vPrefixedTagName` → `tagNamePrefix`, `includePdb` → `fileOptions.excludedExts`, `helper-bundle-id`, `squirrelWindows.noMsi`, root-level `directories` in `package.json`, and `toolsets.*` values v27 rejects (`null`, the retired `appimage: "1.0.2"`). Values with no v27 equivalent (for example `nativeRebuilder: "legacy"` or `electronDownload.strictSSL`) are dropped with a warning.

**It warns but leaves in place** what cannot be rewritten mechanically: `squirrelWindows.customSquirrelVendorDir`, a custom NSIS bundle in `customNsisBinary` / `customNsisResources` ([→ `toolsets.nsis`](./v27-config-changes.md#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis); it does move `customNsisBinary.debugLogging` → `installerDebugLogging`), a custom `mac.sign` signer combined with sibling signing options, an `includePdb` value v26 rejected, and, in JS/TS configs, platform-level `asarUnpack` next to root-level ASAR options, an `includePdb` whose value is not a literal, or, for `includePdb: true`, a platform section the codemod cannot read or a root `fileOptions.excludedExts` with an element it cannot read (a spread, an identifier, a call; readable platform lists still get `"!pdb"`).

**It prints an advisory** (without changing the config) for runtime defaults and behavior changes you should check: an `nsis-web` target ([`disableWebInstaller`](./v27-runtime-changes.md#disablewebinstaller-defaults-to-true)), `nsis.perMachine` or `nsisWeb.perMachine` set to `true` ([per-machine NSIS updates](./v27-runtime-changes.md#nsis-per-machine-builds-set-isadminrightsrequired)), a custom `win.sign.sign` hook without `win.sign.publisherName`, unless `win.verifyUpdateCodeSignature` is `false` ([publisher name](./v27-build-changes.md#windows-publishername-is-validated-against-the-signing-certificate)), a `win.sign.publisherName` entry that is not a distinguished name, e.g. a bare name ([publisher name DN](./v27-build-changes.md#windows-publishername-must-be-a-distinguished-name)), `win.sign: false` / `null` or `win.sign.publisherName: null`, unless `win.verifyUpdateCodeSignature` is `false` ([missing publisher name](./v27-build-changes.md#missing-publishername-fails-update-verification)), a `generic` publish configuration whose `url` has a query string ([update credentials](./v27-runtime-changes.md#update-credentials-stay-on-the-feeds-origin)), a `fileOptions.files` pattern that names `.pdb` files ([`includePdb` → `fileOptions.excludedExts`](./v27-config-changes.md#includepdb-fileoptionsexcludedexts)), and a `mac`/`mas`/`masDev` section that names no entitlements file ([tightened default entitlements](./v27-runtime-changes.md#macos-default-entitlements-tightened)).

**It does not touch** anything outside the config: CLI flags, environment variables, custom NSIS scripts, Linux maintainer scripts, app code using the electron-updater API, or plugins using `PlatformPackager`. Every change on the Build, Runtime and Developer pages is a manual step.
