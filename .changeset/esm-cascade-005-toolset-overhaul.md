---
"app-builder-lib": minor
---

Toolset overhaul: ToolsetCustom, split modules, PlatformPackager API cleanup

Introduces first-class support for user-supplied toolset bundles via the new `ToolsetCustom`
interface, consolidates split toolset files into unified `linux.ts` / `windows.ts` / `appimage.ts`
/ `custom.ts` modules, upgrades toolset default versions, and cleans up the `PlatformPackager` API.

---

### Summary

#### `ToolsetCustom` — bring-your-own toolset bundles

All toolset config fields (`winCodeSign`, `fpm`, `appimage`, `linuxToolsMac`, `nsis`, `wine`)
now accept a `ToolsetCustom` object in addition to a version string:

```jsonc
{
  "toolsets": {
    "winCodeSign": {
      "url": "https://my-mirror.example.com/winsign-1.1.0.7z",
      "checksum": "abc123…"
    }
  }
}
```

The bundle is downloaded once, verified against `checksum`, extracted, and cached alongside
the managed toolsets. See [`ToolsetCustom`](packages/app-builder-lib/src/configuration.ts) for
the full interface.

#### Toolset module consolidation

Previously toolset helpers were scattered across many small files. They are now organized as:

| New module | Contents |
|---|---|
| `toolsets/linux.ts` | `getFpmPath`, `getLinuxToolsMacToolset`, `getLinuxToolsPath`, `getAppImageTools` |
| `toolsets/windows.ts` | `getWindowsKitsBundle`, `getWindowsSignToolExe`, `getRceditBundle`, `getNsisBundlePath`, et al. |
| `toolsets/appimage.ts` | AppImage-specific checksum table (re-export) |
| `toolsets/custom.ts` | `getCustomToolsetPath` — download + verify + extract any `ToolsetCustom` |
| `toolsets/win/wine.ts` | `getWinePath` — Wine toolset (separate because it is wine-specific) |

All prior split-file imports are forwarded from `indexInternal.ts` for backward compat.

#### Default version upgrades

| Toolset | Old default | New default |
|---|---|---|
| AppImage | `0.0.0` (FUSE2) | `1.0.3` |
| FPM | `1.0.0` | `1.0.0` (unchanged) |
| Wine | `0.0.0` | `1.0.1` |

`appimage: "1.0.2"` is also now a valid version in `ToolsetConfig`.

#### `PlatformPackager` API cleanup

`PlatformPackager.info` is now `protected`. Downstream code that previously accessed
`packager.info.X` should instead use the new delegate getters added directly to
`PlatformPackager`:

```ts
packager.tempDirManager       // was: packager.info.tempDirManager
packager.metadata              // was: packager.info.metadata
packager.framework             // was: packager.info.framework
packager.cancellationToken     // was: packager.info.cancellationToken
packager.repositoryInfo        // was: packager.info.repositoryInfo
packager.emitArtifactCreated() // was: packager.info.emitArtifactCreated()
// … and several more
```

### Changed Files

| File | Change |
|---|---|
| `packages/app-builder-lib/src/configuration.ts` | Add `ToolsetCustom` to all toolset union types; add `appimage: "1.0.2"`; restore deprecated `snap` property; comprehensive JSDoc |
| `packages/app-builder-lib/src/toolsets/linux.ts` | Merged FPM, AppImage, linuxToolsMac into one file; optional params for test compat |
| `packages/app-builder-lib/src/toolsets/windows.ts` | Merged winCodeSign, NSIS, rcedit into one file; `ToolsetCustom` support everywhere |
| `packages/app-builder-lib/src/toolsets/custom.ts` | New — `getCustomToolsetPath` impl |
| `packages/app-builder-lib/src/toolsets/appimage.ts` | New — AppImage checksum table |
| `packages/app-builder-lib/src/toolsets/win/wine.ts` | New — Wine toolset helper |
| `packages/app-builder-lib/src/platformPackager.ts` | Delegate getters added; `.info` made protected |
| `packages/app-builder-lib/src/packager.ts` | Removed deprecated `framework`/`nodeVersion` config handling |
| `packages/app-builder-lib/src/targets/linux/LinuxTargetHelper.ts` | Removed legacy `snap` fallback; use `snapcraft` config only |
| `packages/app-builder-lib/src/targets/linux/snap/SnapTarget.ts` | Use `snapcraft` exclusively |
| `packages/app-builder-lib/src/indexInternal.ts` | Export new toolset symbols |

### Validations

- `pnpm compile` — passes (0 errors)
- `pnpm typecheck` — passes
- `pnpm typecheck:test` — passes
