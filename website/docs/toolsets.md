---
title: "Toolsets"
---

electron-builder relies on a handful of external **binary bundles** — the NSIS compiler, Wine, the Windows code-signing tools, the AppImage runtime, FPM, and a few others — that it downloads on demand and caches locally. The top-level [`toolsets`](./configuration.md) key lets you pin the version of each bundle, or point electron-builder at a bundle you host yourself.

For most projects you never touch this key: every toolset defaults to the newest published bundle. You reach for `toolsets` only to **pin a specific (or legacy) version**, or to **supply a custom bundle** in place of a built-in one.

:::info[New in v27]
Before v27, toolset selection was a mix of fixed version pins and environment-variable overrides (`APPIMAGE_TOOLS_PATH`, `ELECTRON_BUILDER_NSIS_DIR`, `USE_SYSTEM_WINE`, …). v27 **removes every one of those env vars** and replaces them with the typed `toolsets` config on this page. See [Toolsets & environment variables](./migration/v27-breaking-changes.md#toolsets-environment-variables) in the breaking-changes reference and the [Replacing removed environment variables](#replacing-removed-environment-variables) section below.
:::

## The toolsets

Each property of `toolsets` corresponds to one downloadable bundle, hosted at [electron-userland/electron-builder-binaries](https://github.com/electron-userland/electron-builder-binaries/releases):

| Toolset | Used for | `"latest"` resolves to |
|---|---|---|
| `winCodeSign` | Windows code signing & resource editing (`signtool` / `osslsigncode`, `rcedit`, Windows Kits for AppX/MSIX) | `1.3.0` |
| `appimage` | Building `.AppImage` files (`mksquashfs`, `unsquashfs`, the self-executing runtime) | `1.1.0` |
| `nsis` | Compiling Windows installers (`makensis`, plugin DLLs, `elevate.exe`) | `1.2.1` |
| `wine` | Running Windows tools (NSIS, rcedit, signtool) on non-Windows hosts | `system` (host `wine` on `PATH`) |
| `fpm` | Building Linux packages (`.deb`, `.rpm`, `.pacman`, …) on macOS & Linux | `2.2.1` |
| `linuxToolsMac` | Building Linux targets / `.tar.lz` archives on macOS (`ar`, `lzip`, `gtar`) | `1.0.1` |
| `sevenZip` | Extracting `.7z` and `.tar.xz` archives internally | `1.0.1` |
| `icons` | Converting source images to `.icns`, `.ico`, and PNG icon sets | `1.2.3` |
| `squirrel` | Building Squirrel.Windows installers (`Squirrel.exe`, `SyncReleases.exe`, `nuget.exe`, `7z`) — requires `electron-builder-squirrel-windows` | `1.1.1` |

:::note[Platform notes]
- **`wine`** is only needed to build **Windows targets on a non-Windows machine**. On Windows it has no effect. It defaults to the **host-installed `wine`** on `PATH` (`"system"`) on both macOS and Linux, so a macOS host that builds Windows targets needs Wine installed (`brew install --cask wine-stable`). `toolsets.wine: "1.0.1"` still downloads the Wine 11.0 bundle on macOS when pinned explicitly, but the published bundle ships no PE builtins, so it cannot run Windows tools on its own.
- **`winCodeSign`** is used on all platforms (`signtool.exe` on Windows, `osslsigncode` on macOS/Linux).
- **`squirrel`** is only used by the `squirrelWindows` target. It runs natively on Windows; on macOS/Linux it needs a host-installed `mono`, and `rcedit` (from `winCodeSign`) runs under Wine.
- **`fpm`**, **`icons`**, and **`squirrel`** each have only one published version today, so `"latest"` and the listed version are equivalent.
:::

For the full version-by-version breakdown of what each `"latest"` bundle upgrades from — and which are drop-in replacements versus behavior changes — see the migration table in [Toolset defaults resolve to `"latest"`](./migration/v27-breaking-changes.md#toolset-defaults-resolve-to-latest-newest-bundle).

## Default resolution — `"latest"`

Every `toolsets.*` property defaults to **`"latest"`**. An **unset** property and the literal string **`"latest"`** both resolve to the **newest published bundle** for that toolset. These two are interchangeable:

```json5
{ "build": { "toolsets": {} } }                          // unset → latest
{ "build": { "toolsets": { "nsis": "latest" } } }        // explicit latest
```

:::note
`null` is no longer accepted: it was dropped from the `ToolsetConfig` type and the configuration schema rejects it, so use `"latest"` or omit the key. `electron-builder migrate-schema` removes `null` entries (and rewrites the retired `appimage: "1.0.2"` pin to `"1.0.3"`).
:::

Pinning to a concrete version is as simple as naming it:

```yaml
toolsets:
  nsis: "1.2.1"
  winCodeSign: "1.3.0"
```

## Pinning the legacy bundle (`"0.0.0"`)

Every toolset accepts the sentinel version **`"0.0.0"`**, which selects the **pre-v27 legacy bundle** for that tool. It is the escape hatch if a newer bundle introduces a regression:

```json5
{
  "build": {
    "toolsets": {
      "winCodeSign": "0.0.0",
      "nsis": "0.0.0",
      "appimage": "0.0.0",
      "wine": "0.0.0"
    }
  }
}
```

Pinning `"0.0.0"` also changes a few behaviors that are gated on the bundle version — for example, the legacy AppImage bundle (`appimage: "0.0.0"`) is the FUSE2 runtime and re-adds the automatic `--no-sandbox` launch argument, and a `winCodeSign` below `1.3.0` forces the legacy PowerShell path for Azure Trusted Signing (see [Code signing & toolsets](#code-signing-and-toolsets)).

:::warning[Short-term workaround only]
`"0.0.0"` is intended as a temporary fallback while you resolve an incompatibility. The alias **may be removed in a future major release** — prefer moving to a current bundle (or a [custom toolset](#custom-toolsets)) rather than relying on it long-term.
:::

## Custom toolsets

Instead of a version string, any toolset can be set to a **`ToolsetCustom`** object to supply your own bundle:

```typescript
toolsets.<name>: { url: string, checksum?: string, version?: string }
```

| Field | Required | Description |
|---|---|---|
| `url` | **yes** | An `https://` URL or a `file://` path. See below. |
| `checksum` | for downloaded archives | SHA-256 of the archive as 64 lowercase hex characters. See [Custom toolset checksums](#custom-toolset-checksum). **Required** for `https://` URLs and for `file://` **archive files**. **Not** needed for a bare `file://` **directory** (used as-is, no caching). |
| `version` | no | Label used only in the local cache directory name. Falls back to the first 8 characters of `checksum` when omitted. |

**`url` accepts two forms:**

- **`https://…`** — the bundle is **downloaded, checksum-verified, extracted, and cached** locally.
- **`file://…`** — a local path. A bare **directory** is used **as-is** (no checksum, no extraction). A local **archive file** is extracted and cached (checksum required). Relative `file://` paths must resolve inside the project's build-resources directory; absolute paths are used directly.

```json5
// Remote bundle (URL) — checksum required
{ "build": { "toolsets": { "nsis": {
  "url": "https://example.com/my-nsis-bundle-1.0.tar.gz",
  "checksum": "<lowercase SHA-256 hex of the archive>",
  "version": "my-custom-1.0"
} } } }

// Local directory (used as-is, no checksum)
{ "build": { "toolsets": { "appimage": {
  "url": "file:///path/to/my-appimage-tools-dir"
} } } }
```

### Custom toolset checksums {#custom-toolset-checksum}

Every custom toolset bundle uses the same checksum format, whichever toolset it replaces: `winCodeSign`, `appimage`, `nsis`, `wine`, `fpm`, `linuxToolsMac`, `sevenZip`, `icons` or `squirrel`.

- **Format:** the SHA-256 of the archive file, as 64 **lowercase hex** characters. This is the format `@electron/get` verifies a downloaded bundle against. (An uppercase hex value is lowercased for you.)
- **Not accepted:** base64-encoded SHA-512 values, which v26 configs (for example `nsis.customNsisBinary`) typically used, and prefixed forms such as `sha256:…`. electron-builder rejects a checksum in any other format before downloading. Recompute it from the archive instead of converting the old value.
- **When it is needed:** for an `https://` URL and for a `file://` archive file. A bare `file://` directory needs none.

Compute it from the exact archive that `url` points to:

| Platform | Command |
|---|---|
| macOS, Linux | `shasum -a 256 my-bundle.tar.gz` (or `sha256sum my-bundle.tar.gz`) |
| Windows (PowerShell) | `(Get-FileHash -Algorithm SHA256 my-bundle.tar.gz).Hash.ToLower()` |
| Windows (cmd) | `certutil -hashfile my-bundle.tar.gz SHA256`, then lowercase the hash it prints |

```json5
{ "build": { "toolsets": { "nsis": {
  "url": "https://example.com/my-nsis-bundle-1.0.tar.gz",
  "checksum": "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4",
  "version": "my-custom-1.0"
} } } }
```

Recompute the checksum whenever you rebuild or repack the archive.

:::warning[The bundle must mirror the built-in layout]
A custom bundle has to match the **directory layout** of the corresponding built-in bundle — electron-builder looks for the same executables in the same relative paths. Use the build scripts in [electron-builder-binaries/packages](https://github.com/electron-userland/electron-builder-binaries/tree/master/packages) as the reference for each toolset's expected structure.
:::

### Supported archive formats

Archives supplied via `url` are extracted automatically. Supported formats: **`.zip`**, **`.7z`**, **`.tar.gz`** / **`.tgz`**, **`.tar.xz`** / **`.txz`** and **`.tar.7z`**. A bare directory (no archive) is used as-is.

The two families are unpacked differently, which decides where the bundle root is:

- **Tar archives** (`.tar.gz`, `.tgz`, `.tar.xz`, `.txz`, `.tar.7z`) are extracted with their first path component stripped, so put everything inside **one top-level folder** (`tar -czf bundle.tar.gz my-bundle`). That folder becomes the bundle root.
- **`.zip` and `.7z`** are extracted as they are, so put the bundle's files **at the root of the archive**, not inside a folder. A release zip that wraps everything in a versioned folder (such as `nsis-3.10/`) has to be repacked.

:::note[sevenZip exception]
Because 7-Zip is the tool electron-builder uses to extract `.7z` and `.tar.xz` archives, a custom **`sevenZip`** bundle can't itself be one of those formats — that would be circular. Supply it only as a **`.tar.gz`**, **`.zip`**, or bare **`file://` directory**. (The bundle must contain `bin/7za` on macOS/Linux or `bin/7za.exe` on Windows.)
:::

### Custom NSIS bundle layout {#custom-nsis-bundle-layout}

A custom `toolsets.nsis` bundle replaces the whole NSIS toolset: the `makensis` compiler, the NSIS data directory (`NSISDIR`: stubs, headers and UIs), the plugins and `elevate.exe`. electron-builder looks these up relative to the bundle root, in this order:

| What | Where electron-builder looks | Needed |
|---|---|---|
| `makensis`, entrypoint layout | `makensis` (macOS, Linux) or `makensis.cmd` (Windows) at the root. It is run as-is and must set `NSISDIR` itself. | One of the two `makensis` layouts |
| `makensis`, fallback layout (the v26 bundle layout) | Used when the entrypoint is missing: `Bin/makensis.exe` (Windows), `mac/makensis` (macOS) or `linux/makensis` (Linux), with `NSISDIR` set to the bundle root. | |
| NSIS data (`NSISDIR`) | `Stubs/`, `Include/` and `Contrib/` (including `Modern UI 2`, `Language files` and `Graphics`) inside `NSISDIR`: `windows/` in the default bundle, whose entrypoint sets it, or the bundle root in the fallback layout. | Yes |
| Plugins | `plugins/<arch>/`, else `windows/Plugins/<arch>/`. `<arch>` is `x86-unicode`, or `x86-ansi` with `unicode: false`; no other architecture folder is read. The names are case-sensitive on case-sensitive file systems. | Yes |
| `elevate.exe` | At the bundle root. | Unless `packElevateHelper: false` (and `perMachine` is not `true`) |

The default bundle (`nsis-bundle-3.12.tar.gz` from the [`nsis@1.2.1` release](https://github.com/electron-userland/electron-builder-binaries/releases) of electron-builder-binaries) uses the entrypoint layout:

```text
nsis-bundle/                 top-level folder, stripped on extraction
├── makensis                 POSIX entrypoint: runs mac/<x64|arm64>/makensis or linux/<x64|arm64>/makensis with NSISDIR=windows
├── makensis.cmd             Windows entrypoint: runs windows/makensis.exe with NSISDIR=windows
├── elevate.exe
├── mac/x64/makensis, mac/arm64/makensis
├── linux/x64/makensis, linux/arm64/makensis
└── windows/                 NSISDIR
    ├── makensis.exe
    ├── Stubs/  Include/  Contrib/
    └── Plugins/x86-unicode/, Plugins/x86-ansi/, …
```

**What electron-builder brings itself:** the installer scripts and their `.nsh` headers (including the headers for `StdUtils`, `UAC` and `nsProcess`), the installer messages, and any extra plugins you put in `build/x86-unicode/` or `build/x86-ansi/`. It does not patch the bundle.

**What the bundle must carry:** the plugin DLLs. Besides the plugins that ship with NSIS (`System`, `nsExec`, `nsDialogs`, `BgImage`, …), the installer scripts call `StdUtils`, `UAC`, `nsProcess`, `WinShell` and `SpiderBanner`, plus `nsis7z` (7z app package), `nsisunz` (zip app package) and `INetC` (`nsis-web`). The default bundle also patches a few files in `Contrib/Language files` (Finnish, Hungarian, Korean, Simplified Chinese, Thai, Turkish); a bundle built from a stock NSIS release lacks those fixes unless you copy them over.

**`makensis` and the stubs must come from the same build**: the same NSIS version or fork (for example NSISBI) and the same compile-time options. Official NSIS and NSISBI releases ship only a Windows `makensis.exe`, so to build on macOS or Linux, compile `makensis` for that host from the same source with the same options (`scons … install-compiler`). [`installerDebugLogging`](./migration/v27-breaking-changes.md#nsiscustomnsisbinary-toolsetsnsis) additionally needs `makensis` and the stubs compiled with `NSIS_CONFIG_LOG=yes`, which the bundled versions are not.

#### Repacking an NSIS or NSISBI release

1. Start from the default bundle (above) so you keep its entrypoints, `elevate.exe` and plugins.
2. Replace `windows/makensis.exe` and `windows/Stubs/` with those of your NSIS or NSISBI release, and `windows/Include/` and `windows/Contrib/` too if the release changes them. Keep `windows/Plugins/`, adding the release's own plugins where they differ.
3. For each macOS or Linux host you build on, replace `mac/<arch>/makensis` or `linux/<arch>/makensis` with one compiled from the same source and options. If you build only on Windows, the other hosts' binaries are never run.
4. Pack it with one top-level folder (`tar -czf my-nsis.tar.gz nsis-bundle`) and compute its [checksum](#custom-toolset-checksum).
5. Point `toolsets.nsis` at it: `{ "url": "https://…/my-nsis.tar.gz", "checksum": "<that hex value>", "version": "nsisbi-3.10" }`. While testing, `{ "url": "file:///abs/path/to/nsis-bundle" }` uses the unpacked folder directly, without a checksum.

For a Windows-only build you can instead use the fallback layout: the unpacked folder of a stock NSIS release zip already has `Bin/makensis.exe`, `Stubs/`, `Include/`, `Contrib/` and `Plugins/` (check that your fork's does too). Add `elevate.exe` at its root and the extra plugins listed above to `Plugins/x86-unicode/`, then zip its contents with the files at the root of the zip.

## Replacing removed environment variables

v27 **removes** the toolset environment-variable overrides. Replace each with a `toolsets.<name>` custom object:

| Removed env var | Toolset it controlled | Replacement |
|---|---|---|
| `APPIMAGE_TOOLS_PATH` | AppImage build tools | `toolsets.appimage: { url }` |
| `LINUX_TOOLS_MAC_PATH` | linux-tools-mac bundle | `toolsets.linuxToolsMac: { url }` |
| `CUSTOM_FPM_PATH` | FPM executable | `toolsets.fpm: { url }` |
| `ELECTRON_BUILDER_NSIS_DIR` | NSIS compiler bundle | `toolsets.nsis: { url }` |
| `ELECTRON_BUILDER_NSIS_RESOURCES_DIR` | NSIS resources/plugins | `toolsets.nsis: { url }` |
| `CUSTOM_NSIS_RESOURCES` | Alternate NSIS resources | `toolsets.nsis: { url }` |
| `ELECTRON_BUILDER_WINE_TOOLSET_DIR` | Wine bundle | `toolsets.wine: { url }` |
| `USE_SYSTEM_WINE` | Host Wine instead of the bundle | `toolsets.wine: "system"` |
| `USE_SYSTEM_SIGNCODE` | Host `signtool`/`signcode` | Configure via [`win.sign`](./features/code-signing/code-signing-win.md) + `winCodeSign` |
| `USE_SYSTEM_OSSLSIGNCODE` | Host `osslsigncode` | Configure via [`win.sign`](./features/code-signing/code-signing-win.md) + `winCodeSign` |
| `USE_SYSTEM_FPM` | Host `fpm` instead of the bundle | `toolsets.fpm: { url }` |

```json5
{ "build": { "toolsets": { "nsis": {
  "url": "https://example.com/my-nsis-bundle.tar.gz",
  "checksum": "<lowercase SHA-256 hex of the archive>"
} } } }
```

:::warning[No env-var replacement for the signing overrides]
The two signing `USE_SYSTEM_*` variables (`USE_SYSTEM_SIGNCODE`, `USE_SYSTEM_OSSLSIGNCODE`) have **no env-var equivalent** — configure signing through [`win.sign`](./features/code-signing/code-signing-win.md) and the `winCodeSign` toolset instead. `USE_SYSTEM_WINE` is replaced by the config value `toolsets.wine: "system"`.

`USE_SYSTEM_FPM` is likewise removed. On **Windows there is no bundled FPM**, so an FPM-based target now **requires** an explicit custom `toolsets.fpm` (`{ url: "file:///path/to/dir" }`) and otherwise throws a clear configuration error — previously it silently fell back to a host `fpm` on `PATH`.
:::

See [Toolset env-var overrides removed](./migration/v27-breaking-changes.md#toolset-env-var-overrides-removed) for the complete rationale.

## Code signing and toolsets

Windows signing is driven by the `winCodeSign` toolset in combination with [`win.sign`](./features/code-signing/code-signing-win.md):

- The default `winCodeSign` (`"latest"` → `1.3.0`) bundles a modern `signtool` / `osslsigncode` (native arm64) plus the Windows Kits used for AppX/MSIX. The `hsm` and `pkcs11` signing modes require this modern bundle.
- **Azure Trusted Signing** (`win.sign: { type: "azure" }`) uses the faster `signtool /dlib` path **out of the box**, because the default `winCodeSign` ships the ATS `dlib` + .NET 8 payload — no pin needed. To force the legacy PowerShell `Invoke-TrustedSigning` path, pin `winCodeSign` **below** `1.3.0` (e.g. `"1.2.1"` or `"0.0.0"`). A `ToolsetCustom` object uses the `dlib` from your supplied bundle.

For full setup — certificate methods, HSM/PKCS#11, and Azure — see [Code Signing for Windows](./features/code-signing/code-signing-win.md) and [Azure Trusted Signing `signtool /dlib` is the default](./migration/v27-breaking-changes.md#azure-trusted-signing-signtool-dlib-is-the-default).

