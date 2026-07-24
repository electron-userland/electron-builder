---
title: "Toolsets"
---

electron-builder relies on a handful of external **binary bundles** — the NSIS compiler, Wine, the Windows code-signing tools, the AppImage runtime, FPM, and a few others — that it downloads on demand and caches locally. The top-level [`toolsets`](./configuration.md) key lets you pin the version of each bundle, or point electron-builder at a bundle you host yourself.

For most projects you never touch this key: every toolset defaults to the newest published bundle. You reach for `toolsets` only to **pin a specific (or legacy) version**, or to **supply a custom bundle** in place of a built-in one.

:::info[New in v27]
Before v27, toolset selection was a mix of fixed version pins and environment-variable overrides (`APPIMAGE_TOOLS_PATH`, `ELECTRON_BUILDER_NSIS_DIR`, `USE_SYSTEM_WINE`, …). v27 **removes every one of those env vars** and replaces them with the typed `toolsets` config on this page. See [Toolsets & environment variables](./migration/v27-breaking-changes.md#toolsets--environment-variables) in the breaking-changes reference and the [Replacing removed environment variables](#replacing-removed-environment-variables) section below.
:::

## The toolsets

Each property of `toolsets` corresponds to one downloadable bundle, hosted at [electron-userland/electron-builder-binaries](https://github.com/electron-userland/electron-builder-binaries/releases):

| Toolset | Used for | `"latest"` resolves to |
|---|---|---|
| `winCodeSign` | Windows code signing & resource editing (`signtool` / `osslsigncode`, `rcedit`, Windows Kits for AppX/MSIX) | `1.3.0` |
| `appimage` | Building `.AppImage` files (`mksquashfs`, `unsquashfs`, the self-executing runtime) | `1.1.0` |
| `nsis` | Compiling Windows installers (`makensis`, plugin DLLs, `elevate.exe`) | `1.2.1` |
| `wine` | Running Windows tools (NSIS, rcedit, signtool) on non-Windows hosts | `1.0.1` |
| `fpm` | Building Linux packages (`.deb`, `.rpm`, `.pacman`, …) on macOS & Linux | `2.2.1` |
| `linuxToolsMac` | Building Linux targets / `.tar.lz` archives on macOS (`ar`, `lzip`, `gtar`) | `1.0.0` |
| `sevenZip` | Extracting `.7z` and `.tar.xz` archives internally | `1.0.0` |
| `icons` | Converting source images to `.icns`, `.ico`, and PNG icon sets | `1.2.1` |

:::note[Platform notes]
- **`wine`** is only needed to build **Windows targets on a non-Windows machine**. On Windows it has no effect. On **Linux**, electron-builder uses the **host-installed `wine`** (no bundle is shipped for Linux); the version pin applies to **macOS**, where the bundled Wine 11.0 runs — including on arm64 via Rosetta.
- **`winCodeSign`** is used on all platforms (`signtool.exe` on Windows, `osslsigncode` on macOS/Linux).
- **`fpm`**, **`linuxToolsMac`**, and **`sevenZip`** each have only one published version today, so `"latest"` and the listed version are equivalent.
:::

For the full version-by-version breakdown of what each `"latest"` bundle upgrades from — and which are drop-in replacements versus behavior changes — see the migration table in [Toolset defaults resolve to `"latest"`](./migration/v27-breaking-changes.md#toolset-defaults-resolve-to-latest-newest-bundle).

## Default resolution — `"latest"`

Every `toolsets.*` property defaults to **`"latest"`**. An **unset** property, an explicit **`null`**, and the literal string **`"latest"`** all resolve to the **newest published bundle** for that toolset. These three are interchangeable:

```json5
{ "build": { "toolsets": {} } }                          // unset → latest
{ "build": { "toolsets": { "nsis": "latest" } } }        // explicit latest
{ "build": { "toolsets": { "nsis": null } } }            // null → latest (see note)
```

:::note
`null` is no longer part of the `ToolsetConfig` type. It still works at runtime, but TypeScript/programmatic configs typed against `Configuration` should use `"latest"` (or omit the key) instead. `electron-builder migrate-schema` does **not** rewrite this.
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

Pinning `"0.0.0"` also changes a few behaviors that are gated on the bundle version — for example, the legacy AppImage bundle (`appimage: "0.0.0"`) is the FUSE2 runtime and re-adds the automatic `--no-sandbox` launch argument, and a `winCodeSign` below `1.3.0` forces the legacy PowerShell path for Azure Trusted Signing (see [Code signing & toolsets](#code-signing--toolsets)).

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
| `checksum` | for downloaded archives | SHA checksum used to verify the bundle. **Required** for `https://` URLs and for `file://` **archive files**. **Not** needed for a bare `file://` **directory** (used as-is, no caching). |
| `version` | no | Label used only in the local cache directory name. Falls back to the first 8 characters of `checksum` when omitted. |

**`url` accepts two forms:**

- **`https://…`** — the bundle is **downloaded, checksum-verified, extracted, and cached** locally.
- **`file://…`** — a local path. A bare **directory** is used **as-is** (no checksum, no extraction). A local **archive file** is extracted and cached (checksum required). Relative `file://` paths must resolve inside the project's build-resources directory; absolute paths are used directly.

```json5
// Remote bundle (URL) — checksum required
{ "build": { "toolsets": { "nsis": {
  "url": "https://example.com/my-nsis-bundle-1.0.tar.gz",
  "checksum": "sha256:abc123…",
  "version": "my-custom-1.0"
} } } }

// Local directory (used as-is, no checksum)
{ "build": { "toolsets": { "appimage": {
  "url": "file:///path/to/my-appimage-tools-dir"
} } } }
```

:::warning[The bundle must mirror the built-in layout]
A custom bundle has to match the **directory layout** of the corresponding built-in bundle — electron-builder looks for the same executables in the same relative paths. Use the build scripts in [electron-builder-binaries/packages](https://github.com/electron-userland/electron-builder-binaries/tree/master/packages) as the reference for each toolset's expected structure.
:::

### Supported archive formats

Archives supplied via `url` are extracted automatically. Supported formats: **`.zip`**, **`.7z`**, **`.tar.gz`**, **`.tar.xz`**. A bare directory (no archive) is used as-is.

:::note[`sevenZip` exception]
Because 7-Zip is the tool electron-builder uses to extract `.7z` and `.tar.xz` archives, a custom **`sevenZip`** bundle can't itself be one of those formats — that would be circular. Supply it only as a **`.tar.gz`**, **`.zip`**, or bare **`file://` directory**. (The bundle must contain `bin/7za` on macOS/Linux or `bin/7za.exe` on Windows.)
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
| `USE_SYSTEM_WINE` | Host Wine instead of the bundle | `toolsets.wine: { url }` |
| `USE_SYSTEM_SIGNCODE` | Host `signtool`/`signcode` | Configure via [`win.sign`](./features/code-signing/code-signing-win.md) + `winCodeSign` |
| `USE_SYSTEM_OSSLSIGNCODE` | Host `osslsigncode` | Configure via [`win.sign`](./features/code-signing/code-signing-win.md) + `winCodeSign` |
| `USE_SYSTEM_FPM` | Host `fpm` instead of the bundle | `toolsets.fpm: { url }` |

```json5
{ "build": { "toolsets": { "nsis": {
  "url": "https://example.com/my-nsis-bundle.tar.gz",
  "checksum": "sha256:abc123…"
} } } }
```

:::warning[No env-var replacement for the signing overrides]
The three signing `USE_SYSTEM_*` variables (`USE_SYSTEM_WINE`, `USE_SYSTEM_SIGNCODE`, `USE_SYSTEM_OSSLSIGNCODE`) have **no env-var equivalent** — configure signing through [`win.sign`](./features/code-signing/code-signing-win.md) and the `winCodeSign` toolset instead.

`USE_SYSTEM_FPM` is likewise removed. On **Windows there is no bundled FPM**, so an FPM-based target now **requires** an explicit custom `toolsets.fpm` (`{ url: "file:///path/to/dir" }`) and otherwise throws a clear configuration error — previously it silently fell back to a host `fpm` on `PATH`.
:::

See [Toolset env-var overrides removed](./migration/v27-breaking-changes.md#toolset-env-var-overrides-removed) for the complete rationale.

## Code signing & toolsets

Windows signing is driven by the `winCodeSign` toolset in combination with [`win.sign`](./features/code-signing/code-signing-win.md):

- The default `winCodeSign` (`"latest"` → `1.3.0`) bundles a modern `signtool` / `osslsigncode` (native arm64) plus the Windows Kits used for AppX/MSIX. The `hsm` and `pkcs11` signing modes require this modern bundle.
- **Azure Trusted Signing** (`win.sign: { type: "azure" }`) uses the faster `signtool /dlib` path **out of the box**, because the default `winCodeSign` ships the ATS `dlib` + .NET 8 payload — no pin needed. To force the legacy PowerShell `Invoke-TrustedSigning` path, pin `winCodeSign` **below** `1.3.0` (e.g. `"1.2.1"` or `"0.0.0"`). A `ToolsetCustom` object uses the `dlib` from your supplied bundle.

For full setup — certificate methods, HSM/PKCS#11, and Azure — see [Code Signing for Windows](./features/code-signing/code-signing-win.md) and [Azure Trusted Signing `signtool /dlib` is the default](./migration/v27-breaking-changes.md#azure-trusted-signing-signtool-dlib-is-the-default).

