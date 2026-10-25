---
title: "v27 Runtime Changes (Shipped App)"
sidebar_label: "Runtime (Shipped App)"
---

# v27 Runtime Changes (Shipped App)

What the installed app, its installer or its auto-updater does differently on your users' machines, including the electron-updater API your app code calls. Part of the [v27 Breaking Changes](./v27-breaking-changes.md) reference.

**How you'll find out:** many of these changes **warn during the build** or print a **migrate-schema advisory**, but the effect only shows on users' machines once they install the update. Each entry starts with a **How you'll find out** line; check the ones marked **Silent** before you ship.

## At a glance {#at-a-glance}

| Change | Announced | Action required |
|--------|---|----------------|
| [`disableWebInstaller` defaults to `true` (electron-updater)](#disablewebinstaller-defaults-to-true) | Advisory, runtime error | Web-installer updates are rejected (`ERR_UPDATER_WEB_INSTALLER_DISABLED`) unless `disableWebInstaller` is `false`; v27+ `nsis-web` installs opt in automatically; older installs, and apps switching from `nsis` to `nsis-web`, need `disableWebInstaller: false` |
| [`nsis-web` installer verifies and installs its own copy of the app package](#disablewebinstaller-defaults-to-true) | Silent until install | A `--package-file` package or a publish-URL download that does not match, or a `--package-file` package that cannot be copied, aborts the install (exit code `2`); the local package file is now left in place. Only if you run one web installer with a `--package-file` from another build: set `nsisWeb.allowUnverifiedAppPackage: true` |
| [NSIS: per-machine builds set `isAdminRightsRequired` in the update info](#nsis-per-machine-builds-set-isadminrightsrequired) | Advisory | None for most apps. Their updates are started with `elevate.exe`; with `autoInstallEvent: "onNextLaunch"`, per-machine apps call `installPendingUpdateIfAvailable()` to install a pending update |
| [Update credentials are only sent to the feed's origin (electron-updater)](#update-credentials-stay-on-the-feeds-origin) | Warns, advisory, runtime log | Only if `latest*.yml` points downloads at another origin (another host, or another port or scheme) that needs your `requestHeaders` / `addAuthHeader` credentials or a token in the feed URL's query: serve the files from the feed origin or use pre-signed URLs. A custom provider used with credential headers must override `Provider.feedBaseUrl` (else `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED`) |
| [Windows update signature verification fails closed (electron-updater)](#windows-update-signature-verification-fails-closed) | Runtime error | An NSIS update is installed only when PowerShell verifies it: one electron-updater 6 installed with a warning (PowerShell could not be started or run, Windows 7/8) is now rejected (`ERR_UPDATER_SIGNATURE_UNVERIFIABLE`); a catalog signature is rejected as an invalid signature (`ERR_UPDATER_INVALID_SIGNATURE`) unless the app opts in with `allowCatalogSignature = true` (or the release with `win.allowCatalogSignature` in a signed manifest). If PowerShell may be blocked on your users' machines, assign a native `verifyUpdateFileAuthenticodeSignature` in your first electron-updater 7 release |
| [`quitAndInstall` takes an options object (electron-updater)](#quitandinstall-takes-an-options-object) | TS error, runtime log | Replace positional args: `quitAndInstall(true, false)` → `quitAndInstall({ isSilent: true, isForceRunAfter: false })` |
| [`autoInstallOnAppQuit` replaced by `autoInstallEvent` enum (electron-updater)](#autoinstallevent-replaces-autoinstallonappquit) | TS error, runtime log | `autoInstallOnAppQuit = false` → `autoInstallEvent = "manual"`; default `"onQuit"` preserves behavior |
| [`downloadUpdate()` resolves with an object, not an array (electron-updater)](#downloadupdate-resolves-with-a-downloadexecutorresult-object) | TS error, runtime log | `const [installer] = await downloadUpdate()` → `const { updateFile } = await downloadUpdate()`; same for `checkForUpdates()` → `downloadPromise` |
| [`verifyUpdateCodeSignature` renamed and returns a result object (electron-updater)](#verifyupdatecodesignature-renamed-to-verifyupdatefileauthenticodesignature) | Silent (shim) | `NsisUpdater.verifyUpdateCodeSignature` → `verifyUpdateFileAuthenticodeSignature`; return `{ response: "success" }` / `{ response: "failure", message }` instead of `null` / `string` |
| [macOS default entitlements tightened](#macos-default-entitlements-tightened) | Advisory, partial warning | The bundled default now grants only `allow-jit`; add `allow-unsigned-executable-memory` / `disable-library-validation` back in `build/entitlements.mac.plist` (and `.inherit.plist`) only if your app needs them |
| [macOS: the ASAR integrity digest is embedded](#macos-asar-integrity-digest) | Warns (with `afterPack`) | With Electron 41+, the Electron Framework is patched and signed again ad hoc after `afterPack`; set `mac.asarIntegrityDigest: false` if you sign the app yourself in `afterPack`, change `app.asar` / `Info.plist` after it, or merge separately built x64 and arm64 apps with `@electron/universal` yourself |
| [DMG `filesystem` defaults to APFS](#dmg-filesystem-defaults-to-apfs) | Silent | Set `dmg.filesystem: "HFS+"` only if you need pre-10.13 macOS compatibility |
| [NSIS file-association ProgID format changed](#nsis-file-association-progid-format-changed) | Warns (custom script only) | Update custom NSIS scripts that hard-code the old ProgID |
| [Linux `.desktop` `Exec` now runs a generated `*-launcher` script](#linux-launcher-entrypoint) | Silent | Update custom `.desktop`/AppArmor/MIME tooling that hard-codes the `Exec` command (the flatpak target is not affected) |
| [Linux `executableArgs` field codes are now literal](#linux-launcher-entrypoint) | Warns | Remove `%F`/`%U` from `executableArgs`; use `linux.desktop.entry.Exec` |
| [`http-parser` dropped from default pacman `depends`](#pacman-default-dependencies-changed) | Silent | Add it back with `"depends": ["default", "http-parser"]` only if your app really needs it |
| [Flatpak default permissions no longer include the home directory](#flatpak-default-permissions) | Warns | Only without `flatpak.finishArgs`: the app gets the Downloads folder (`--filesystem=xdg-download`) instead of read/write access to the whole home directory; its data under `~/.var/app` is unaffected. If it opens other paths on its own (recent files, `~/Documents`, dotfiles, `~/.pki/nssdb` certificates), set `finishArgs` to the v26 list or add narrower grants such as `--filesystem=xdg-documents` |
| [Flatpak default permissions leave out the notifications talk-name](#flatpak-default-permissions) | Warns | Only without `flatpak.finishArgs`, and unless the base is `org.electronjs.Electron2.BaseApp` before `23.08` (the default is `26.08`; any other `base` gets no talk-name either): notifications go through the notification portal. Where the desktop has no portal backend for notifications (e.g. sway with only `xdg-desktop-portal-wlr`) they no longer appear — add `--talk-name=org.freedesktop.Notifications` to `finishArgs`, or users run `flatpak override --user --talk-name=org.freedesktop.Notifications <id>` |
| [Flatpak `useWaylandFlags` no longer adds `--enable-features=UseOzonePlatform` for Electron 16 to 37](#flatpak-wayland-flags) | Warns | Only with `flatpak.useWaylandFlags`: add the flag to `flatpak.executableArgs` if the app needs it |
| [Snap core24: no `allow-sandbox` by default](#snap-core24-no-allow-sandbox-by-default) | Warns | None for most apps — default core24 snaps now launch with `--no-sandbox` and pass Snap Store review; vetted publishers can request `allow-sandbox` explicitly |
| [Snap core24: `"default"` in `plugs` merges the full default set](#snap-core24-default-in-plugs-merges-the-full-default-set) | Warns | `["default", …]` now also adds `browser-support` (and, without the `gnome` extension, the content-snap plugs); list plugs without `"default"` to replace the defaults |

---

## Auto-update (electron-updater)

### `disableWebInstaller` defaults to `true` {#disablewebinstaller-defaults-to-true}

**How you'll find out:** **migrate-schema advisory** for an `nsis-web` target. At runtime the update fails with `ERR_UPDATER_WEB_INSTALLER_DISABLED`. The installer's package check is **silent** until an install fails.

`AppUpdater.disableWebInstaller` now defaults to **`true`**. NSIS *web* installers (the small installer that downloads the full payload at install time from a manifest-supplied URL) are no longer loaded unless you opt in, because that payload may not undergo signature verification.

Unless `disableWebInstaller` is `false`, a web-installer update is rejected with `ERR_UPDATER_WEB_INSTALLER_DISABLED` — at download time (including an update already cached by a previous launch), before an install on next launch, and at install time.

- **You do not use a web installer** (the common case): no action — this is the safer default.
- **Your installs were made by an `nsis-web` installer built with v27+**: no action — they opt in automatically. NSIS installers now write a `resources/package-type` marker, and `NsisUpdater` reads it to default `disableWebInstaller` to `false` for web-installer installs.
- **Your web-installer installs lack that marker** (installed by an installer built before v27, or with a custom script), **or you are switching an app from `nsis` to `nsis-web`**: opt in manually (below), or those installs will not update.

A web update cached by a previous launch, or pending an install on next launch, is used only if its web package still matches the freshly fetched manifest. A web-installer update whose update info has no `sha512` for the web package is rejected with `ERR_UPDATER_NO_CHECKSUM`. The `nsis-web` installer now also verifies the package it installs: an explicit `--package-file` must match the SHA-512 of one of the packages built with it (any arch), and a package downloaded from the default publish-derived (versioned) URL must match the package for the detected arch; a package downloaded from an explicit `appPackageUrl` (e.g. a version-independent `latest` URL) is not verified. A mismatch aborts the installation (exit code `2`) before the installed version is removed, so that version stays installed. The new `nsisWeb.allowUnverifiedAppPackage` option (default `false`) opts out, for one web installer used with packages of other builds. See [Web Installer](../nsis.md#web-installer).

A local package — passed via `--package-file` (electron-updater does this for updates) or found next to the installer — is first copied into the installer's own temporary directory, and the installer verifies and installs that copy. The local package file is now left in place (the installer's copy is moved into the app's update cache instead; electron-updater removes the package it passed from its `pending` directory once the updated app starts), and a `--package-file` package that cannot be copied aborts the installation (exit code `2`), also before the installed version is removed; a package next to the installer that cannot be copied is ignored and downloaded instead, as when its checksum doesn't match.

Because the manifest vouches for the web package, don't set `updateManifest: false` for `nsis-web` apps: [signed update manifests](../features/signed-update-manifests.md) cover its path, SHA-512 and size.

**Action:** if you publish and rely on an NSIS web installer and your installs lack the marker, or you are switching from `nsis` to `nsis-web`, opt in by setting `disableWebInstaller: false` in your main process:

```ts
import { NsisUpdater } from "electron-updater"
const updater = new NsisUpdater()
updater.disableWebInstaller = false // only if you intentionally ship a web installer
```

> **Tip:** running `electron-builder migrate-schema` on a project that builds an `nsis-web` target now prints an advisory: web-installer updates are rejected unless the app opts in, when to set `autoUpdater.disableWebInstaller = false` at runtime, and when to set `nsisWeb.allowUnverifiedAppPackage`. The advisory is informational only — it never rewrites your config (`disableWebInstaller` is an electron-updater runtime setting, not a build-config key).

### NSIS: per-machine builds set `isAdminRightsRequired` in the update info {#nsis-per-machine-builds-set-isadminrightsrequired}

**How you'll find out:** **migrate-schema advisory** when `perMachine` is `true`. The build itself is silent.

electron-builder now sets `isAdminRightsRequired: true` in the update info of every per-machine `nsis` and `nsis-web` build (`perMachine: true`), including assisted installers (`oneClick: false`) that don't set `packElevateHelper` and builds with `differentialPackage: false`. For `nsis-web` builds it is written into the file entry of the installer, where electron-updater reads it. electron-updater starts these updates with `elevate.exe` right away and, like other per-machine updates, does not install them automatically at launch with `autoInstallEvent: "onNextLaunch"`.

**Action:** none for most apps. With `autoInstallEvent: "onNextLaunch"`, per-machine apps call `installPendingUpdateIfAvailable()` to install a pending update.

> **Tip:** `electron-builder migrate-schema` prints an advisory when `nsis.perMachine` or `nsisWeb.perMachine` is `true`.

### Update credentials stay on the feed's origin {#update-credentials-stay-on-the-feeds-origin}

**How you'll find out:** **Warns during the build** for a `generic` feed URL with a query string, plus a **migrate-schema advisory**. electron-updater **logs a warning at runtime** the first time it drops credentials.

electron-updater now sends the credential headers from `requestHeaders` / `addAuthHeader` — headers such as `Authorization`, the same set that is removed on a cross-origin redirect — and the query string of the feed `url` only to the feed's origin. This applies to the generic, s3, spaces, r2, keygen, bitbucket, github and gitlab providers.

<details>
<summary>How the origin rule applies to each kind of download</summary>

- An installer, web package, blockmap or differential range request on another origin is requested without those headers and without the feed query. Another origin is another host, or the same host with another port or scheme (`https://updates.example.com` → `https://updates.example.com:8443` or `http://updates.example.com`); as on redirects, an `http` → `https` upgrade of the same host on the default ports keeps the headers and the feed query. Such a URL keeps its own query string, so pre-signed URLs work. With every provider, including custom ones, a URL that electron-updater resolves against the feed URL (such as `files[].url` or a blockmap) gets the feed query only on the feed's origin.
- Downloads on the feed origin (relative `files[].url`, the default) are unchanged. For GitLab the feed origin is `https://<host>`, where electron-builder publishes the release assets.
- When the app sets `previousBlockmapBaseUrlOverride`, the old blockmap is downloaded with the credentials if it is on that origin.
- A blockmap is downloaded from `${url}.blockmap` with the file URL's query string, which does not fit a pre-signed installer URL. The new, optional `files[].blockMapUrl` in `latest*.yml` names the blockmap's own URL; a relative value resolves like `url`, an absolute one is used as-is; it follows the same origin rule and is covered by the [manifest signature](../features/signed-update-manifests.md#what-is-signed) when present. With it, the old blockmap comes from the local cache or `previousBlockmapBaseUrlOverride`, else that update is downloaded in full. electron-builder does not write it.
- A custom provider that extends a built-in provider (e.g. `GenericProvider` or `GitHubProvider`) inherits its `feedBaseUrl`. Any other custom provider must declare it by overriding `Provider.feedBaseUrl`: its feed URL (the credential headers then only go to that origin) or `null` (the request headers go to every download URL, as before). If it declares neither and the download headers include a credential header (from `requestHeaders`, `addAuthHeader` or the provider's `fileExtraDownloadHeaders`), `downloadUpdate()` fails with `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED` before any download request. Without credential headers nothing changes.

</details>

electron-builder warns once per feed when a `generic` publish `url` (the feed written to `app-update.yml`) has a query string, naming its parameters, and electron-updater announces the change at run time: the first download that loses credential headers logs a warning naming the headers and the two origins, and the first one that does not get the feed query logs one naming the query parameters (never their values). A signature failure on a manifest with a `blockMapUrl` says that it is covered by the signature.

**Action:** a custom provider that does not extend a built-in one and is used with credential headers must override `Provider.feedBaseUrl` (see above). Otherwise none if your update files are served from the feed origin. If `latest*.yml` uses absolute URLs on another origin that authenticate with your `requestHeaders` / `addAuthHeader`, or with a token in the feed URL's query (e.g. `url: https://updates.example.com/?key=…`), those downloads now fail (for example with 401 or 403). Serve the files from the feed origin, or use pre-signed URLs. The manifest signature, [required by default](./v27-build-changes.md#signed-update-manifests-are-required) in v27, covers `files[].url` and `packages.<arch>.path`, so pre-signed URLs have to be in `latest*.yml` before it is signed (see [Key storage](../features/key-rotation.md#key-storage)); installs with a public key refuse a manifest whose URLs changed after signing.

> **Tip:** `electron-builder migrate-schema` prints an advisory for a `generic` publish configuration whose `url` has a query string.

### Windows update signature verification fails closed {#windows-update-signature-verification-fails-closed}

**How you'll find out:** **Silent** at build time. On users' machines the update fails with `ERR_UPDATER_SIGNATURE_UNVERIFIABLE` (with a link here) or `ERR_UPDATER_INVALID_SIGNATURE`.

The NSIS updater installs an update only when `Get-AuthenticodeSignature` positively verifies it. electron-updater 6 (and the earlier v27 alphas) installed the update unverified, with a warning, when it could not run PowerShell: on Windows 7 and 8 whenever PowerShell failed, and elsewhere when a follow-up `ConvertTo-Json` check failed as well — when `powershell.exe` could not be started (missing, blocked, not found on `PATH`), or when that check failed or timed out after PowerShell had failed or timed out, which an installer that takes long to verify, served by a compromised update feed, could bring about. Each of these rejects the update with the error code `ERR_UPDATER_SIGNATURE_UNVERIFIABLE`, as do a timeout, output that cannot be parsed, a valid signature without a signer certificate subject and output without the path of the verified file (which skipped only that path check). An update whose signature Windows reports from a security catalog instead of one embedded in the installer is rejected too (`ERR_UPDATER_INVALID_SIGNATURE`): an update installer is in no catalog, so the file is another, catalogued one, such as an in-box Windows program (before, the catalog signer was matched against `publisherName` like any other). If your update installers are catalog-signed on purpose (for example, an enterprise deployment adds their hashes to a catalog), opt in with `autoUpdater.allowCatalogSignature = true` (an `NsisUpdater` property, `false` by default): a catalog signature is then accepted, with a warning, when it is valid, its signer matches `publisherName` and the verified file is the update file. A release can allow it instead: build with `win.allowCatalogSignature: true` (electron-builder, `false` by default), which writes `allowCatalogSignature: true` into the `latest.yml` of the `nsis` and `nsis-web` targets. electron-updater honors it only when the [signature of that manifest](../features/signed-update-manifests.md) was verified against a trusted key (`updateManifestPublicKey`); in a manifest that was not verified it is ignored with a warning naming `autoUpdater.allowCatalogSignature`. The field is covered by the manifest signature, so changing it for a published release means re-signing or republishing `latest.yml`. electron-updater 7.0.0-alpha.8 to alpha.11 installs with an update key configured reject a signed manifest that sets it (`ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`), the same way alpha.8 treats a signed `files[].blockMapUrl`: publish such a release only once those installs have updated. Both apply to the default verify function only.

PowerShell is also run more defensively, by electron-updater and by the build-time installer check alike:

- `powershell.exe` is started by its absolute path (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`) instead of being looked up in the current directory and `PATH`, where a planted `powershell.exe` — for example next to a document the app was opened with — could report any installer as validly signed. A process without an absolute `SystemRoot` (or `windir`) environment variable cannot verify updates.
- The installer's path is passed in an environment variable instead of being quoted into the PowerShell command.
- The script no longer assigns an output encoding, which PowerShell's Constrained Language Mode (AppLocker / WDAC script enforcement) forbids — electron-updater 7.0.0-alpha.8 to alpha.10 rejected every update there. Non-ASCII characters of paths, certificate subjects and error messages are escaped in PowerShell's output instead.
- PowerShell gets up to 60 s (was 20 s) before the verification fails.

This applies only where electron-updater verifies an update against a `publisherName`. What happens without one is unchanged by it: an `app-update.yml` without `publisherName` fails closed (see [A missing `publisherName` fails update verification](./v27-build-changes.md#missing-publishername-fails-update-verification)), `verifyUpdateCodeSignature: false` opts out, and an app with no update config file at all is not verified, as before.

**Action:** none if your users' machines can run Windows PowerShell. If some may not — for example where AppLocker or WDAC blocks `powershell.exe` — verify updates natively by assigning [`verifyUpdateFileAuthenticodeSignature`](../win.md#how-do-you-use-a-custom-verify-function-to-enable-nsis-signature-verification-alternatives-instead-of-powershell) in the first release you build with electron-updater 7. electron-updater 6 still installs that release where PowerShell cannot run (with a warning), but from then on such an install rejects every update, including one that adds the native verifier, and only reinstalling recovers it.

---

## electron-updater API {#electron-updater-api}

### `quitAndInstall` takes an options object {#quitandinstall-takes-an-options-object}

**How you'll find out:** **TypeScript error.** Plain JavaScript callers get a **runtime warning** when they pass booleans.

`AppUpdater.quitAndInstall(isSilent?, isForceRunAfter?)` replaced its positional boolean arguments with a single destructured options object. This is a **hard compile break in TypeScript** (plain JavaScript callers must update by hand — positional booleans are silently ignored):

```ts
// Before (v26)
autoUpdater.quitAndInstall(true, false)

// After (v27)
autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: false })
```

Defaults are unchanged (`isSilent: false`, `isForceRunAfter: false`), so `quitAndInstall()` with no arguments behaves exactly as before. The object form also carries the new v27 `waitUntilNextLaunch` flag, which defers the install to the next application launch instead of spawning the installer on quit — see [Install on Next Launch](../features/auto-update#install-on-next-launch-windowslinux).

### `autoInstallEvent` replaces `autoInstallOnAppQuit` {#autoinstallevent-replaces-autoinstallonappquit}

**How you'll find out:** **TypeScript error.** Assigning `autoInstallOnAppQuit` **logs a runtime warning**.

The `autoInstallOnAppQuit` boolean on `AppUpdater` is replaced by a single enum, **`autoInstallEvent: "manual" | "onQuit" | "onNextLaunch"`** (default `"onQuit"`), and is **removed** with no compat alias. A single boolean cannot represent the three states, so this is a clean replacement rather than a shim.

| Before | After |
|---|---|
| `autoInstallOnAppQuit = true` (default) | `autoInstallEvent = "onQuit"` (default) |
| `autoInstallOnAppQuit = false` | `autoInstallEvent = "manual"` |
| — *(new in v27)* | `autoInstallEvent = "onNextLaunch"` |

```ts
// Before
autoUpdater.autoInstallOnAppQuit = false

// After
autoUpdater.autoInstallEvent = "manual"
```

The default `"onQuit"` preserves prior behavior, so most apps need no change. `"onNextLaunch"` defers the install to the next launch to avoid the OS killing the installer during session end, and is planned to become the default in v28 — see [Install on Next Launch](../features/auto-update#install-on-next-launch-windowslinux).

### `downloadUpdate()` resolves with a `DownloadExecutorResult` object {#downloadupdate-resolves-with-a-downloadexecutorresult-object}

**How you'll find out:** **TypeScript error.** Destructuring the result as an array **logs a runtime warning**, but `result[0]` is silently `undefined`.

`AppUpdater.downloadUpdate()` — and `UpdateCheckResult.downloadPromise`, the same promise handed back by `checkForUpdates()` when `autoDownload` is enabled — used to resolve with a positional `Array<string>`: `[updateFile]`, or `[updateFile, packageFile]` for NSIS *web* installers. It now resolves with a **`DownloadExecutorResult`** object (exported from `electron-updater`) that names both files:

```ts
interface DownloadExecutorResult {
  readonly updateFile: string // the downloaded installer / AppImage / zip
  readonly packageFile?: string // the NSIS web-installer package, only set for web installers
}
```

This is a **hard compile break in TypeScript**; plain JavaScript callers that index the result (`files[0]`) receive `undefined` and must update by hand:

```ts
// Before (v26 / electron-updater 6)
const files = await autoUpdater.downloadUpdate()
const installer = files[0]

const result = await autoUpdater.checkForUpdates()
const [downloaded] = (await result?.downloadPromise) ?? []

// After (v27 / electron-updater 7)
const { updateFile, packageFile } = await autoUpdater.downloadUpdate()

const result = await autoUpdater.checkForUpdates()
const downloaded = (await result?.downloadPromise)?.updateFile
```

Code that only awaits the promise for its side effects, or that relies on the `update-downloaded` event, needs no change. Additively, the `update-downloaded` event payload (`UpdateDownloadedEvent`) now also carries `packageFile` for web installers, next to the existing `downloadedFile`.

### `verifyUpdateCodeSignature` renamed to `verifyUpdateFileAuthenticodeSignature`

**How you'll find out:** **Silent.** The old name keeps working through a deprecated shim until v28.

NSIS Authenticode verification no longer uses the `null`-means-success / `string`-means-error convention. `NsisUpdater.verifyUpdateCodeSignature` is renamed to `verifyUpdateFileAuthenticodeSignature` and returns a result object:

```ts
type VerifyUpdateFileResult = { response: "success" } | { response: "failure"; message: string }
```

```ts
// Before (v6)
autoUpdater.verifyUpdateCodeSignature = async (publisherNames, path) => (isValid ? null : "why it failed")

// After (v7)
autoUpdater.verifyUpdateFileAuthenticodeSignature = async (publisherNames, path) =>
  isValid ? { response: "success" } : { response: "failure", message: "why it failed" }
```

The old name is kept as a compatibility shim that translates in both directions, so existing code keeps working; it is deprecated and **will be removed in v28**. The same applies to the protected `_verifyUpdateCodeSignature` member, which is renamed to `_verifyUpdateFileAuthenticodeSignature` — a subclass that *assigns* the old name still works through a deprecated accessor, but a subclass that *redeclares* it as a class field shadows that accessor and must be migrated.

If you override the protected `BaseUpdater.verifyInstallerSignatureOnLaunch` (added earlier in the same v27 pre-release cycle, so only 7.0.0-alpha users are affected), return `{ response: "success" }` rather than `null` — `null` is now read as a verification failure and blocks every install-on-next-launch.

Additively, all updaters gain `AppUpdater.verifyUpdateFile` for app-defined verification of the downloaded file on every path that can lead to an install. See [Custom downloaded-file verification](../features/auto-update.md#custom-downloaded-file-verification).

---

## macOS {#macos}

### macOS default entitlements tightened {#macos-default-entitlements-tightened}

**How you'll find out:** **migrate-schema advisory** when no entitlements file is named. After signing, the build **warns** about libraries that would fail library validation. Dropping `allow-unsigned-executable-memory` is **silent**.

The bundled default entitlements file (used when neither `mac.sign.entitlements` nor `build/entitlements.mac.plist` is present) now grants **only** `com.apple.security.cs.allow-jit`. `com.apple.security.cs.allow-unsigned-executable-memory` and `com.apple.security.cs.disable-library-validation` are **no longer granted by default** — modern Electron does not need either in the main process, and both materially weaken the Hardened Runtime.

- **Nested binaries** (helpers, frameworks, `.node` modules, executables in `app.asar.unpacked`) are no longer signed with one blanket plist. They now receive [`@electron/osx-sign`](https://github.com/electron/osx-sign)'s per-file defaults — renderer/GPU helpers: `allow-jit`; plugin helper: Chromium's looser set; everything else: `default.darwin.plist` — unless you supply `build/entitlements.mac.inherit.plist` / `mac.sign.entitlementsInherit`.
- **MAS builds** without a `build/entitlements.mas.plist` fall back to `@electron/osx-sign`'s sandboxed `default.mas.plist` (previously they received the non-sandboxed `mac` template).
- **Ad-hoc builds** (`mac.sign.identity: "-"`) keep working: a built-in ad-hoc entitlements file that includes `disable-library-validation` is applied to the app and its nested binaries.
- **New post-sign warning:** after signing, electron-builder lists Mach-O libraries and bundles under `Contents/Resources/app.asar.unpacked` and `Contents/PlugIns` (which electron-builder never re-signs) whose signature carries a different Team ID (or none) while `disable-library-validation` is not granted — these would fail library validation when loaded. Executables are spawned rather than loaded, so they are not subject to library validation and are not flagged.

**Action is required only if** your app loads frameworks, plugins, or native modules signed by another Team ID (or unsigned), or still relies on `allow-unsigned-executable-memory`: add the keys back in `build/entitlements.mac.plist` (and in `build/entitlements.mac.inherit.plist` when a helper process or a sidecar executable does the loading — library validation is enforced by the loading process based on its own entitlements, not by what the nested file was signed with). See [Loading third-party or unsigned binaries](../mac#loading-third-party-or-unsigned-binaries).

This is a runtime default, not a config-key rename, so `migrate-schema` does not change it.

### macOS: the ASAR integrity digest is embedded {#macos-asar-integrity-digest}

**How you'll find out:** **Warns during the build** when the project has an `afterPack` hook. Otherwise silent.

With Electron 41 and later, electron-builder writes a digest of the `ElectronAsarIntegrity` hashes in `Info.plist` into the Electron Framework binary and signs the framework again ad hoc; signing the app afterwards replaces that signature. With the `enableEmbeddedAsarIntegrityValidation` fuse, Electron then refuses to start an app whose `Info.plist` hashes no longer match the digest, so `app.asar` can't be swapped together with its `Info.plist` hash. The digest is computed from `Info.plist` as `afterPack` left it, right before the fuses are flipped and the app is signed. It is skipped on non-macOS hosts (with a warning), with `asar: false` or `asar.disableIntegrity: true`, and for `--prepackaged` apps.

```json5
{ "build": { "mac": { "asarIntegrityDigest": false } } }  // leave the Electron Framework as Electron ships it
```

**Action is required only if** you sign the app yourself in `afterPack` (the framework is signed again after your hook), change `app.asar` or `Info.plist` after `afterPack`, or build `x64` and `arm64` separately and merge them with `@electron/universal` yourself (each framework now has its own `_CodeSignature`, which the merge rejects; build the `universal` arch instead). In those cases set `mac.asarIntegrityDigest: false`.

### DMG `filesystem` defaults to APFS {#dmg-filesystem-defaults-to-apfs}

**How you'll find out:** **Silent.**

The default DMG volume filesystem changed from **`HFS+`** to **`APFS`**. APFS is the modern macOS filesystem and produces smaller, faster-to-mount images on current macOS.

- **No action** for most projects.
- **If you must support pre-10.13 (High Sierra) macOS**, which cannot mount APFS volumes, set the filesystem back to `HFS+` explicitly:

```json5
{ "dmg": { "filesystem": "HFS+" } }
```

This is a runtime default, not a config-key rename, so `migrate-schema` does not change it.

---

## Windows (NSIS) {#windows-nsis}

### NSIS file-association ProgID format changed {#nsis-file-association-progid-format-changed}

**How you'll find out:** **Warns during the build** when `nsis.include` / `nsis.script` is set. Otherwise silent.

NSIS installers that declare `fileAssociations` now register each association under a unique, Microsoft-recommendation-compliant **ProgID** instead of using the association `name` (or extension) verbatim. The previous value could collide with unrelated applications — most easily when forking a project without changing `fileAssociations[].name`.

The generated ProgID has the form `<program>.<component>`: `<program>` is derived from your `productName` (so it stays readable in the registry) and `<component>` mixes a short readable prefix with a value derived from the app GUID. It is at most 39 characters, contains only letters, digits, and a single period, and never starts with a digit.

**No config change is required, and there is nothing to auto-migrate.** `fileAssociations` and its `name` / `ext` / `description` fields are unchanged; the new ProgID is produced automatically. The installer and uninstaller derive the same ProgID, so registration and removal stay in sync.

**Action is required only if** you ship a custom NSIS script (`nsis.include` / `nsis.script`) or external tooling that hard-codes the old ProgID — the association `name` or extension — for example to add extra shell verbs or registry entries under that key. Update those references to the new generated value.

> On upgrade, an installer built with v27 registers the new ProgID. One-click installers run the previous version's uninstaller during the upgrade, which removes the old-format entry; with assisted installers that do not uninstall the prior version first, the old ProgID may remain in the registry until that version is removed.

---

## Linux {#linux}

Also affecting shipped Linux apps, documented elsewhere:

- The installed `.desktop` filename always follows `desktopName`: [`linux.syncDesktopName` (always synced)](./v27-config-changes.md#linuxsyncdesktopname-always-synced).
- Flatpak bundles target the `26.08` runtime by default: [Flatpak: native build, minimum tool versions, `26.08` runtime by default](./v27-build-changes.md#flatpak-tooling-requirements).

### Linux launcher entrypoint {#linux-launcher-entrypoint}

**How you'll find out:** **Silent**, except for a build warning when `executableArgs` contains a desktop-entry field code such as `%F`.

Every Linux target except flatpak (deb/rpm, AppImage, snap) now launches through a generated `<executableName>-launcher` shell script rather than invoking the executable directly. Two things change in the built artifact:

- The package ships a **new file** — `<executableName>-launcher` (e.g. `/opt/<app>/MyApp-launcher`).
- The generated `.desktop` **`Exec` key points at the launcher** instead of the executable (e.g. `Exec=/opt/MyApp/MyApp-launcher %U`), and `executableArgs` / `forceX11` flags are injected into the launcher rather than inlined into `Exec`.

This makes `executableArgs` apply consistently across all Linux targets and keeps the `.desktop` `Exec` a plain command.

The flatpak target keeps the entrypoint it had in v26: its own `/app/bin/electron-wrapper` script (which runs the app through `zypak-wrapper`), with `Exec=electron-wrapper %U` in the `.desktop` file and no `*-launcher` file. `executableArgs` are injected into that script, and in v27 they are single-quoted there as in the other launchers.

**Action is required only if** you ship a custom `.desktop` override, an AppArmor/snap profile, a MIME handler, or external tooling that hard-codes the `Exec` command or assumes the executable itself is the launch target. Point those at the `*-launcher` script (or the executable, as appropriate).

**Desktop-entry field codes in `executableArgs` are now literal.** v26 passed an argument like `%F` into the `.desktop` `Exec` key unquoted (and skipped appending `%U`). In v27 `executableArgs` are injected into the launcher script and quoted, so `%F` reaches your app as the literal string `"%F"` instead of the file list. If you relied on a field code to receive opened files, remove it from `executableArgs` and set `linux.desktop.entry.Exec` instead. electron-builder warns when it sees one.

**AppImage `--no-sandbox` default changed.** The default `--no-sandbox` launch argument is now injected **only for the legacy FUSE2 runtime** (`toolsets.appimage: "0.0.0"`). With the default static FUSE3 runtime (unset / `"latest"` → `1.1.0`), `--no-sandbox` is no longer added automatically — `AppRun` adds it on its own only when user namespaces are unavailable. If you need the Chromium sandbox disabled unconditionally, set `appImage.executableArgs: ["--no-sandbox"]` explicitly: in `linux.executableArgs` it would reach the other Linux targets too, the [flatpak](../flatpak.md#executable-args) included.

### `pacman` default dependencies changed

**How you'll find out:** **Silent.**

`http-parser` was dropped from the default pacman `depends` list. Additionally, `depends` for deb/rpm/pacman now accepts the `"default"` keyword, which expands to the built-in list so you can extend it instead of replacing it:

```json5
{ "build": { "pacman": { "depends": ["default", "my-extra-package"] } } }
```

### Flatpak: narrower default permissions {#flatpak-default-permissions}

**How you'll find out:** **Warns during the build** when `flatpak.finishArgs` is not set.

A build that does not set `flatpak.finishArgs` gets electron-builder's default permissions. Two of them change:

- the app gets the Downloads folder (`--filesystem=xdg-download`) instead of the whole home directory (`--filesystem=home`);
- `--talk-name=org.freedesktop.Notifications` is in the list only for the Electron base app before `23.08`.

A build that sets `finishArgs` is not affected: its list is used as given, as before. The build does not fail either way: the changes show on the users' machines once they update the app. A build that uses the default list warns once, with a link to this section.

**To keep the v26 permissions,** set `finishArgs` to the complete v26 default list:

```yaml
flatpak:
  finishArgs:
    - "--socket=wayland"
    - "--socket=x11"
    - "--share=ipc"
    - "--device=dri"
    - "--socket=pulseaudio"
    - "--filesystem=home"
    - "--share=network"
    - "--talk-name=org.freedesktop.Notifications"
```

#### No home directory access

<details>
<summary>Why, and what keeps working</summary>

**Why.** `--filesystem=home` gives the app read/write access to everything in the home directory, dotfiles included, except other apps' data under `~/.var/app` and the flatpak installation in `~/.local/share/flatpak`. Code that runs in the app, such as a compromised dependency or a script injected into a window with `nodeIntegration`, could write `~/.config/autostart/*.desktop`, `~/.bashrc`, `~/.profile` or a unit in `~/.config/systemd/user`, which the desktop or the shell then runs outside the sandbox at the next login. It could also read `~/.ssh` and `~/.gnupg`.

**What keeps working:**

- **App data.** Inside the sandbox `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME` always point into `~/.var/app/<id>`, with or without home access, so `app.getPath("userData")` and the data that existing installs keep there do not move.
- **Files the user picks.** File dialogs go through the file chooser portal (Electron 14 and later), which gives the app access to the chosen files.
- **Files opened from the desktop.** The desktop entry runs `electron-wrapper %U`, and flatpak forwards those files to the app through the document portal.

</details>

**What breaks.** Without home access the app can no longer reach:

- absolute paths outside Downloads that it did not get from a dialog, such as recent-file lists, project folders and paths stored in its settings or typed by the user;
- default save locations such as `~/Documents`: `app.getPath("documents")`, `"desktop"`, `"pictures"`, `"music"` and `"videos"` return folders the app cannot reach;
- other apps' configuration and dotfiles, such as `~/.gitconfig` or `~/.ssh`, and its own data in a hard-coded `~/.myapp` instead of `app.getPath()`: that is no longer found, and what the app writes there is not kept;
- files passed on a terminal command line (`flatpak run <id> ~/notes.txt`): flatpak forwards only the files of a launch from the desktop entry;
- the user's certificate database in `~/.pki/nssdb`: corporate CA certificates, which TLS-inspecting proxies need, and client certificates are no longer used. Grant `--filesystem=~/.pki/nssdb:ro`, or `--filesystem=~/.pki/nssdb` if the app imports certificates.

**To grant less than the whole home directory,** start from the v27 default list in the [option reference](../flatpak#configuration), since `finishArgs` replaces it, and add what the app needs:

- `--filesystem=xdg-documents`, `xdg-download`, `xdg-desktop`, `xdg-pictures`, `xdg-music` or `xdg-videos`: one of the user's folders, without the dotfiles around it;
- `--persist=.myapp`: keeps a hard-coded `~/.myapp` between runs, stored in `~/.var/app/<id>/.myapp`. Data that an earlier version left in the real `~/.myapp` is not moved there; grant `--filesystem=~/.myapp` to keep using it;
- `:ro` after a filesystem grant, for example `--filesystem=xdg-documents:ro`, for read-only access.

#### No notifications talk-name on current base apps

Electron shows notifications through libnotify. From version 0.8, libnotify sends them through the notification portal when it runs in a sandbox, and talks to the notification daemon (`org.freedesktop.Notifications`) directly only when no portal answers. The Electron base app ships libnotify 0.8 or later since `23.08`, so the default list has the talk-name only when `base` is `org.electronjs.Electron2.BaseApp` (the default) and `baseVersion` is older than `23.08`. With the default `26.08`, and with any other `base`, it is left out. Without it the app can no longer show notifications under another app's name and icon, or replace and close other apps' notifications: the portal attributes them to the app's ID.

**Who is affected:** users whose desktop has no xdg-desktop-portal backend that implements notifications, for example sway with only `xdg-desktop-portal-wlr`. The app's notifications no longer appear there. To bring them back:

- add `--talk-name=org.freedesktop.Notifications` to `finishArgs`, or
- the user runs `flatpak override --user --talk-name=org.freedesktop.Notifications <id>`.

### Flatpak: `useWaylandFlags` no longer adds `--enable-features=UseOzonePlatform` from Electron 16 {#flatpak-wayland-flags}

**How you'll find out:** **Warns during the build** for Electron 16 to 37 with `useWaylandFlags`.

With `flatpak.useWaylandFlags`, v26 added `--enable-features=UseOzonePlatform --ozone-platform=wayland` in a Wayland session whatever the Electron version. v27 adds only `--ozone-platform=wayland` for Electron 16 to 37, where Ozone is on by default, and nothing from Electron 38, which picks Wayland by itself. The second `--enable-features` that v26 added could replace one in `executableArgs`, such as `--enable-features=WaylandWindowDecorations`, because Chromium keeps the last value of a repeated switch. Electron 12 to 15 and an unknown version still get both flags. A build with Electron 16 to 37 warns once about the change.

**Action is required only if** the app relied on the `UseOzonePlatform` feature being passed: add `--enable-features=UseOzonePlatform` to `flatpak.executableArgs`. See [Wayland Support](../flatpak.md#wayland-support).

### Snap core24: no `allow-sandbox` by default {#snap-core24-no-allow-sandbox-by-default}

**How you'll find out:** **Warns during the build** once.

When `snapcraft.core24.plugs` is unset, core24 snaps now request the plain `browser-support` interface. electron-builder 26 requested `browser-support` with `allow-sandbox: true`, but the Snap Store reserves that attribute for vetted publishers (browsers), so store review rejected those uploads. Without `allow-sandbox` the app is launched with `--no-sandbox` and the setuid `chrome-sandbox` helper is left out of the snap — the same as the legacy bases (core18/core20/core22) — and the snap confinement isolates the app instead of Chromium's own sandbox. The build logs a one-time warning about the change.

**No action is required for most apps.** If your publisher has been granted `allow-sandbox`, request it explicitly to keep Chromium's sandbox:

```json
{ "snapcraft": { "base": "core24", "core24": { "plugs": ["default", { "browser-support": { "allow-sandbox": true } }] } } }
```

electron-builder warns whenever a configuration (on any base) requests `allow-sandbox`, because store review rejects it for everyone else.

### Snap core24: `"default"` in `plugs` merges the full default set {#snap-core24-default-in-plugs-merges-the-full-default-set}

**How you'll find out:** **Warns during the build**, listing the plugs the expansion adds.

`"default"` in `snapcraft.core24.plugs` used to expand to the app-level plug list only (`desktop`, `desktop-legacy`, `home`, `x11`, `wayland`, `unity7`, `network`, `gsettings`, `audio-playback`, `pulseaudio`, `opengl`), so `["default", "camera"]` silently dropped `browser-support` and, without the `gnome` extension, the content-snap plugs that the default `layout` relies on. It now expands to the full default set — the app-level list plus everything electron-builder declares when `plugs` is unset for that build (`browser-support`, and for strict builds without the `gnome` extension or destructive mode, `gtk-3-themes`, `icon-themes`, `sound-themes`, `gnome-46-2404` and `gpu-2404`) — and your other entries are added to it, deduplicated by plug name. A descriptor object named like a default plug overrides that plug's attributes, and a `null` descriptor removes a default content-snap plug (for example `{ "sound-themes": null }`) or resets `browser-support` to the snapd defaults. The build logs a one-time warning listing the plugs the expansion adds.

**Action is required only if** you relied on `"default"` leaving those plugs out. A `plugs` list without `"default"` still replaces the defaults entirely.
