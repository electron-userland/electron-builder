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
| `checksum` | for downloaded archives | SHA-256 of the archive as 64 hex characters, or its SHA-512 as 88 base64 characters. See [Custom toolset checksums](#custom-toolset-checksum). **Required** for `https://` URLs and for `file://` **archive files**. **Not** needed for a bare `file://` **directory** (used as-is, no caching). |
| `version` | no | Label used only in the local cache directory name. Falls back to the first 8 hex characters of the `checksum` digest when omitted. |

**`url` accepts two forms:**

- **`https://…`** — the bundle is **downloaded, checksum-verified, extracted, and cached** locally.
- **`file://…`** — a local path. A bare **directory** is used **as-is** (no checksum, no extraction). A local **archive file** is **checksum-verified**, then extracted and cached (checksum required); a mismatch fails the build and leaves the file untouched. Relative `file://` paths must resolve inside the project's build-resources directory; absolute paths are used directly.

```json5
// Remote bundle (URL) — checksum required
{ "build": { "toolsets": { "nsis": {
  "url": "https://example.com/my-nsis-bundle-1.0.tar.gz",
  "checksum": "<SHA-256 hex or base64 SHA-512 of the archive>",
  "version": "my-custom-1.0"
} } } }

// Local directory (used as-is, no checksum)
{ "build": { "toolsets": { "appimage": {
  "url": "file:///path/to/my-appimage-tools-dir"
} } } }
```

### Custom toolset checksums {#custom-toolset-checksum}

Every custom toolset bundle accepts the same checksum formats, whichever toolset it replaces: `winCodeSign`, `appimage`, `nsis`, `wine`, `fpm`, `linuxToolsMac`, `sevenZip`, `icons` or `squirrel`.

- **Formats:** either
  - the SHA-256 of the archive file as 64 **hex** characters (an uppercase value is lowercased for you), or
  - the SHA-512 of the archive file as 88 **base64** characters, ending in `==`. v26 used this format for all toolset checksums, so a v26 value keeps working unchanged in `toolsets.<name>.checksum`.
- **Why SHA-256 hex is the default:** v27 downloads toolsets with the official [`@electron/get`](https://github.com/electron/get) package, whose checksum verification (`sumchecker`) only supports SHA-256 hex. electron-builder verifies a base64 SHA-512 itself.
- **Not accepted:** prefixed forms such as `sha256:…` or `sha512-…`, and a SHA-512 written as hex. electron-builder rejects a checksum in any other format before downloading or extracting anything.
- **When it is needed:** for an `https://` URL and for a `file://` archive file. A bare `file://` directory needs none and is not verified.
- **What is verified:** a downloaded archive is verified before it is cached or extracted (a corrupted download is deleted), and an archive already in the electron-builder cache is re-verified before it is extracted again. A `file://` archive is verified each time before it is extracted; on a mismatch the build fails and your file is left in place.

Compute it from the exact archive that `url` points to:

| Platform | SHA-256 (hex) | SHA-512 (base64) |
|---|---|---|
| macOS, Linux | `shasum -a 256 my-bundle.tar.gz` (or `sha256sum my-bundle.tar.gz`) | `openssl dgst -sha512 -binary my-bundle.tar.gz \| openssl base64 -A` |
| Windows (PowerShell) | `(Get-FileHash -Algorithm SHA256 my-bundle.tar.gz).Hash` | `[Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes((Resolve-Path my-bundle.tar.gz))))` |
| Windows (cmd) | `certutil -hashfile my-bundle.tar.gz SHA256` | — |

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

:::warning[Did you use deprecated `.customNsisBinary`/`.customNsisResources` properties in `v26` config?]
Checkout our [`v26`-> `v27` migration guide](./migration/v26-to-v27#step-4-custom-nsis-migration-guide) and relevant [breaking changes note](./migration/v27-breaking-changes#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis).
:::


#### Custom NSIS bundle Explanation

The new NSIS bundle is extremely flexible in-that it provides entrypoints to give you full control of how NSIS execution begins & where NSIS Resources are checked for. There is one bash script entry-point for linux/mac builds at `/makensis` in the bundle and two entrypoints for windows cmd/powershell builds respectively `/makensis.cmd` & `/makensis.ps1`. Any time makensis is invoked by electron-builder with a custom-nsis-toolset it passes off all the execution arguments to the relevant flavored script-shim based on the build-machine OS. These scripts also make it trivial to set the NSISDIR (NSIS Resources Directory) wherever you want.

The flexible nature of this toolset provides a greener-pasture for custom NSIS development to make some practical and exotic progress.

---

#### Default Custom NSIS bundle Anatomy

A functional flushed out example NSIS Bundle can be found from `electron-builder-binaries` [Default NSIS Bundle](https://github.com/electron-userland/electron-builder-binaries/tree/master/artifacts/nsis). It contains some resources not required for builds that we think still could be useful.

This is the same bundle we use for vanilla-builds and can be explored to get an idea of how custom-nsis bundles work. Here's a breakdown of some highlights:

| File Path | Purpose |
|-|-|
| `/makensis` | A bash script to route all builds running from macOS/Linux hosts to the appropriate `makensis` binary. Also sets `NSISDIR` (NSIS Resource Directory) to be `/windows/` |
| `/makensis.cmd` | A command script to route incoming windows builds from the command prompt to the `/windows/makensis.exe` binary. Also sets `NSISDIR` (NSIS Resource Directory) to be `/windows/` |
| `/makensis.ps1` | A PowerShell script to route incoming windows builds from PowerShell to the `/windows/makensis.exe` binary. Also sets `NSISDIR` (NSIS Resource Directory) to be `/windows/` |
| `/elevate.exe` | A script used by 3rd party UAC plugin for privledge management. **You must include this file in your bundle if you use ElectronBuilder's included NSIS scripts**  |
| `/windows/` | This is the directory used as the NSIS dir for Custom NSIS Resources |
| `/windows/Plugins/x86-unicode/` | This is where all Plugin DLLs called into by NSIS scripts live for this bundle. Some plugins ship with NSIS, some are 3rd party plugins. The 3rd party plugins found here will be required in your custom-build if you use ElectronBuilder's standard NSIS scripts. All `makensis/makensis.exe` binaries in this bundle were compiled with the `x86-unicode` target. They will only call DLLs from this directory.|
| `/windows/Contrib` | These files in here were used **during** the compilation of `makensis/makensis.exe` binaries in this bundle. They are not included at build-time but baked into the running binary. |
|`/nsiconfig.nsh` |  The global config file makensis processes automatically at startup, before your NSIS scripts. It sets default flags and defines like NSIS_MAX_STRLEN, NSIS_CONFIG_* options, etc. |
| `/mac/x64/makensis` | A native `makensis` binary compiled for Intel-CPU macintosh computers. Routed to by `/makensis` entrypoint |
| `/mac/arm64/makensis`| A native `makensis` binary compiled for Apple-Silicon macintosh computers. Routed to by `/makensis` entrypoint |
| `/linux/x64/makensis` | A native `makensis` binary compiled for x64 Linux computers. Routed to by `/makensis` entrypoint |
| `/linux/arm64/makensis`| A native `makensis` binary compiled for arm64 Linux computers. Routed to by `/makensis` entrypoint |
| `/windows/makensis.exe` | A native `makensis.exe` binary compiled for x64 Windows computers. Routed to by `/makensis.cmd` & `/makensis.ps1` entrypoints |

All `makensis/makensis.exe` binaries in this bundle were compiled with the `x86-unicode` build `Target`.

Many files are omitted from this list, but most of the important ones are covered. See also [NSIS Resources](#nsis-resources)

The default bundle (`nsis-bundle-3.12.tar.gz` from the [`nsis@1.2.1` release](https://github.com/electron-userland/electron-builder-binaries/tree/master/artifacts/nsis)

#### Custom NSIS bundle Anatomy (minimal)

Here are the files that are absolutely required for a functional NSIS bundle. Note, you only have to provide shims for the operating system & architecture you intend to build on, you're also free to use wine if you have no native `makensis` binary. Hell go-wild on JIT compile custom NSIS binaries to bake in aesthetic installer choices at build time... Or you know w/e.

| File | Purpose |
|-|-|
| `/makensis` | A bash script to route all builds running from macOS/Linux hosts to the appropriate `makensis` binary. Also sets `NSISDIR` (NSIS Resource Directory) to be `/windows/` |
| `/makensis.cmd` | A command script to route incoming windows builds from the command prompt to the `/windows/makensis.exe` binary. Also sets `NSISDIR` (NSIS Resource Directory) to be `/windows/` |
| `/makensis.ps1` | A PowerShell script to route incoming windows builds from PowerShell to the `/windows/makensis.exe` binary. Also sets `NSISDIR` (NSIS Resource Directory) to be `/windows/` |
| `/elevate.exe` | A script used by 3rd party UAC plugin for privledge management. **You must include this file in your bundle if you use ElectronBuilder's included NSIS scripts**  |
| `/<NSISDIR>/Plugins/<Target>/*` | You must include the plugins provided by NSIS in your NSISDIR` (NSIS Resource Directory). **If you use Electron Builder's built-in NSIS scripts. You also must provide DLLs for these required 3rd party plugins [INetC, StdUtils, SpiderBanner, NsProcess, UAC, WinShell, EmbedHTML, Nsisunz, NSISunzU]** |
| `/<SomePath>/makensis` \|\| `<SomePath>/makensis.exe` | You'll need at least one `makensis/makensis.exe` binary in your bundle and your entry script must pass on makensis execution to it. **You only need to include entrypoint-scripts or binaries for the OS/Arch flavor your electron builder flow runs on**  |

Note soft requirements of `elevate.exe` and `3rd party plugin DLLs` only if you use electron-builder's NSIS scripts. In practice these are almost definitely required without a ton of NSIS scripting work to create entirely custom NSIS scripts for electron-builder.

You can grab these soft-required resources for your own custom bundle `electron-builder-binaries` [Default NSIS Bundle](https://github.com/electron-userland/electron-builder-binaries/tree/master/artifacts/nsis)

:::warning[Limited amd64-unicode support]
Tracking in issue [electron-builder-binaries#230](https://github.com/electron-userland/electron-builder-binaries/issues/230) there are no `amd64-unicode` compiled versions of soft-required 3rd party plugin DLLs. For best results with available NSIS resources, compile your custom NSIS binaries under the `x86-unicode` build `Target`.
:::

#### Out of the NSIS Bundle Anatomy

Worth a quick note that while the bundle itself provides the full and complete NSIS build tools. Electron-Builder and anything building with NSIS still passes in it's own NSIS scripts to use it.

---

#### Helpful Context

A custom `toolsets.nsis` bundle provides the whole NSIS toolset. The NSIS toolset is a build-tool used to compile installer/uninstaller executables for Windows build targets. To be frank, NSIS is an old tool which suffers from a complicated structure and a lot of nuance that is not cohesively documented in all areas. On the flip side NSIS is extremely battle-tested and enjoys one of the largest ecosystem of installer related plugins, tweaks and 3rd party tools. Notably it is a go-to installer type for supporting automatic-updates.

Since documentation can be a bit sparse with regards to the artifacts provided by NSIS and their interactions. A brief breakdown of some key things provided by NSIS are in-order.

---

#### NSIS Binary

As you'd expect, a functional NSIS toolset provides a binary `makensis/makensis.exe` for compiling installers/uninstaller executables for Windows build targets.

While NSIS is a windows build-target tool, it can be natively compiled to run on mac/windows/linux. On mac/linux it compiles to the `makensis` executable file and on windows it compiles to `makensis.exe` executable file.

Unlike modern compilers which allow for multiple output types from one compiler, the `Target` output type a `makensis/makensis.exe` binary compiles to is baked in at compile time. Valid NSIS `Target` types include `x86-unicode`,`x86-ansi`,`amd64-unicode` and one must be chosen when the tool is compiled.

A `makensis/makensis.exe` binary will only build outputs of the `Target` type it was compiled for. Also very important to note, a `makensis/makensis.exe` will only be compatible with resources built for the same `Target` type it was compiled for.

A `makensis/makensis.exe` must be compiled with `NSIS_CONFIG_LOG=yes` to make it possible to enable logging in NSIS scripts.

Many images and assets that effect the installer appearance are also baked into the `makensis/makensis.exe` binary when it is compiled. A custom compiled `makensis/makensis.exe` binary is required for certain aesthetic customizations to the install.

---

#### NSIS Resources

The `makensis/makensis.exe` binary can use a whole directory pattern of various resources for various parts of it's compilation execution. These resources are commonly arranged in a folder-tree like so:

| Resource Type | NSIS Directory Location | Description |
|---|--|---|
| Plugins  | `/Plugins/{ x86-unicode \|\| x86-ansi \|\| amd64-unicode }/<name>.dll`  | Compiled binary DLLs to expose advanced execution to NSIS scripts. These must be compiled with the same `Target` as the `makensis/makensis.exe` binary |
| Include | `/Plugins/<name>.nsh` | These are `.nsh` headers which can contain code/macros used by NSIS scripts |
| Conf File | `/nsiconfig.nsh` |  The global config file makensis processes automatically at startup, before your NSIS scripts. It sets default flags and defines like NSIS_MAX_STRLEN, NSIS_CONFIG_* options, etc. |
| Contrib | `/Contrib/<various>` | These are language/image assets that are baked into the `makensis/makensis.exe` binary when it's created. They are not read during `makensis` exec. |
| Stubs | `/Stubs/<name>` | Functional complete binaries that NSIS uses as a base to customize by appending byte-code to them. In newer versions of NSIS these must also match the `makensis/makensis.exe` binary `Target` flavor |
| Bin | `/Bin/<name>` | Executables that can be used by plugins |

This is a non-exhaustive list of potential resources.

Plugins are particularly of-note here. NSIS scripts do not offer a lot of functionality on their own, so even very basic things can require a Plugin .dll to provide the functionality.


---


#### Debug NSIS logging


:::info[ You can toggle logging on an NSIS bundle via: ]
`.installerDebugLogging` However it additionally needs `makensis/makensis.exe` binaries and the stubs compiled with `NSIS_CONFIG_LOG=yes`, the default bundle NSIS versions is not not.
:::

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
  "checksum": "<SHA-256 hex or base64 SHA-512 of the archive>"
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

