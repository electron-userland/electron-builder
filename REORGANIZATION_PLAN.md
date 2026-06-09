# Reorganization Plan: `app-builder-lib/src`

All paths are relative to `packages/app-builder-lib/src/` unless noted otherwise.

---

## 1. Glossary: Tool Categories

Three distinct categories of external binary/tool management exist in the codebase. These are currently undocumented; understanding them is prerequisite to the file moves below.

### Bundled tools
Defined in `toolsets/` files that call `downloadBuilderToolset()` from `util/electronGet.ts`. These are pre-built binary archives hosted on the `electron-builder-binaries` GitHub releases. Each has a `get*()` function that handles download, extraction, checksum verification, and concurrent-safe locking.

| Toolset file | `get*()` function | Returns |
|---|---|---|
| `toolsets/7zip.ts` | `getPath7za()` | `string` (path) |
| `toolsets/nsis.ts` | `getMakeNsisPath()` | `ToolInfo` (path + optional env) |
| `toolsets/winCodeSign.ts` | `getSignToolPath()` | `ToolInfo` (path + optional env) |
| `toolsets/appimage.ts` | `getAppImageTools()` | object of multiple paths |
| `toolsets/fpm.ts` | `getFpmPath()` | `string` (path) |
| `toolsets/wine.ts` | `getWineToolset()` | `{execPath, env}` |
| `toolsets/icons.ts` | `getIconsToolsetPath()` | `string` (path) |

### Custom tools
Handled by `toolsets/custom.ts` → `getCustomToolsetPath()`. Activated when the user supplies a `ToolsetCustom` object (defined in `configuration.ts`) with a `url` (https://, file://, or local directory) and `checksum`. Uses the same locking/extraction engine as bundled tools. Falls back to treating the path as a plain directory if it isn't an archive.

### System tools
Controlled by boolean flags in `util/flags.ts` (e.g., `isUseSystemFpm`, `isUseSystemWine`, `isUseSystemSigncode`). When active, the tool is resolved from the system PATH or a user-supplied env-var path (via `resolveEnvToolsetPath()`). No download or extraction occurs. Examples: `USE_SYSTEM_FPM`, `USE_SYSTEM_WINE`, `ELECTRON_BUILDER_7ZIP_PATH`.

The `ToolInfo` interface in `util/bundledTool.ts` is the shared return shape used by bundled and custom tools when they need to return both a path and environment variable overrides.

---

## 2. Current Structure: Problems

### Problem A — Platform-specific files buried in shared directories

`util/` is a flat list of 30+ files mixing macOS-only, Windows-only, and shared utilities with no visual distinction:

| File | Platform | Current home | Why it's misplaced |
|---|---|---|---|
| `util/macosIconComposer.ts` | macOS | `util/` | Only called from `platformPackager.ts` behind a macOS guard |
| `util/macosVersion.ts` | macOS host-detection | `util/` | Checks build-host macOS version; no Windows/Linux equivalent |
| `util/plist.ts` | macOS | `util/` | plist is an Apple file format; only callers are `electronMac.ts` and `targets/pkg.ts` |
| `util/resEdit.ts` | Windows | `util/` | Only called from `winPackager.ts`; exported in `indexInternal.ts` |

### Problem B — `codeSign/` mixes shared and platform-specific signing

`codeSign/` contains two groups that do not belong together:
- Shared/generic: `certInfo.ts`, `codesign.ts`, `signManager.ts`
- macOS-specific: `macCodeSign.ts`
- Windows-specific: `windowsCodeSign.ts`, `windowsSignAzureManager.ts`, `windowsSignToolManager.ts`

### Problem C — `electron/` mixes shared framework files with platform-specific setup

- Shared: `ElectronFramework.ts`, `electronVersion.ts`, `injectFFMPEG.ts`, `search-module.ts`
- macOS-specific: `electronMac.ts`
- Windows-specific: `electronWin.ts`

### Problem D — `toolsets/` has no platform grouping

Platform-specific toolsets sit flat alongside shared ones:
- Windows: `nsis.ts`, `winCodeSign.ts`, `wine.ts`
- Linux: `appimage.ts`, `fpm.ts`, `linuxToolsMac.ts`
- Shared: `7zip.ts`, `icons.ts`, `custom.ts`

### Problem E — `vm/` has inconsistent platform scoping

- macOS-specific: `ParallelsVm.ts` (Parallels Desktop is macOS-only)
- Windows build-tool: `WineVm.ts`, `PwshVm.ts`
- Shared base: `vm.ts`
- Cross-platform: `MonoVm.ts`

### Problem F — The `mac/` directory exists but is nearly empty

`mac/MacTargetHelper.ts` is the only file in `mac/`. Under the new structure, the root-level `mac/` directory dissolves entirely — `MacTargetHelper.ts` moves into `targets/mac/` where it belongs with its siblings. The `mac/` root-level dir should not exist after this refactor.

---

## 3. Proposed Directory Layout (target state)

### Design principle

Organize by **purpose** at the root level (the existing directory names are already correct). Add `mac/`, `win/`, `linux/` subdirectories **within** each purpose directory to segregate platform-specific files from shared ones. Shared files in each directory stay flat at the directory root; platform-specific files drop into the appropriate platform subdirectory.

This approach requires no new top-level directories and changes no existing functional groupings.

```
src/
│
├── codeSign/                               (purpose: code signing — unchanged name)
│   ├── mac/
│   │   └── macCodeSign.ts                  ← move from codeSign/ root
│   ├── win/
│   │   ├── windowsCodeSign.ts              ← move from codeSign/ root
│   │   ├── windowsSignAzureManager.ts      ← move from codeSign/ root
│   │   └── windowsSignToolManager.ts       ← move from codeSign/ root
│   ├── certInfo.ts                         (shared — stays flat)
│   ├── codesign.ts                         (shared — stays flat)
│   └── signManager.ts                      (shared — stays flat)
│
├── electron/                               (purpose: electron framework — unchanged name)
│   ├── mac/
│   │   └── electronMac.ts                  ← move from electron/ root
│   ├── win/
│   │   └── electronWin.ts                  ← move from electron/ root
│   ├── ElectronFramework.ts                (shared — stays flat)
│   ├── electronVersion.ts                  (shared — stays flat)
│   ├── injectFFMPEG.ts                     (shared — stays flat)
│   └── search-module.ts                    (shared — stays flat)
│
├── vm/                                     (purpose: VM management — unchanged name)
│   ├── mac/
│   │   └── ParallelsVm.ts                  ← move from vm/ root
│   ├── win/
│   │   ├── WineVm.ts                       ← move from vm/ root
│   │   └── PwshVm.ts                       ← move from vm/ root
│   ├── vm.ts                               (shared base — stays flat)
│   └── MonoVm.ts                           (cross-platform — stays flat)
│
├── toolsets/                               (purpose: external tool management — unchanged name)
│   ├── win/
│   │   ├── nsis.ts                         ← move from toolsets/ root
│   │   ├── winCodeSign.ts                  ← move from toolsets/ root
│   │   └── wine.ts                         ← move from toolsets/ root
│   ├── linux/
│   │   ├── appimage.ts                     ← move from toolsets/ root
│   │   ├── fpm.ts                          ← move from toolsets/ root
│   │   └── linuxToolsMac.ts                ← move from toolsets/ root
│   ├── 7zip.ts                             (shared — stays flat)
│   ├── icons.ts                            (shared — stays flat)
│   └── custom.ts                           (shared — stays flat)
│
├── targets/                                (purpose: build targets)
│   ├── mac/
│   │   ├── MacTargetHelper.ts              ← move from src/mac/ (root mac/ dir dissolves)
│   │   └── pkg.ts                          ← move from targets/ root
│   ├── win/
│   │   ├── nsis/                           ← move from targets/nsis/
│   │   ├── AppxTarget.ts                   ← move from targets/ root
│   │   ├── AppxCapabilities.ts             ← move from targets/ root
│   │   ├── MsiTarget.ts                    ← move from targets/ root
│   │   └── MsiWrappedTarget.ts             ← move from targets/ root
│   ├── linux/
│   │   ├── appimage/                       ← move from targets/appimage/
│   │   ├── snap/                           ← move from targets/snap/
│   │   ├── FlatpakTarget.ts                ← move from targets/ root
│   │   ├── FpmTarget.ts                    ← move from targets/ root
│   │   └── LinuxTargetHelper.ts            ← move from targets/ root
│   ├── blockmap/                           (shared — unchanged)
│   ├── archive.ts                          (shared — stays flat)
│   ├── ArchiveTarget.ts                    (shared — stays flat)
│   ├── differentialUpdateInfoBuilder.ts    (shared — stays flat)
│   ├── targetFactory.ts                    (shared — stays flat)
│   └── targetUtil.ts                       (shared — stays flat)
│
├── util/                                   (purpose: utilities — unchanged name)
│   ├── mac/
│   │   ├── macosIconComposer.ts            ← move from util/ root
│   │   ├── macosVersion.ts                 ← move from util/ root
│   │   └── plist.ts                        ← move from util/ root
│   ├── win/
│   │   └── resEdit.ts                      ← move from util/ root
│   ├── config/                             (unchanged)
│   ├── bundledTool.ts
│   ├── cacheManager.ts
│   ├── cacheState.ts
│   ├── electronGet.ts
│   ├── envPath.ts
│   ├── filter.ts
│   ├── flags.ts
│   ├── hash.ts
│   ├── iconConverter.ts
│   ├── langs.ts                            (stays — cross-platform via license.ts + nsis)
│   ├── license.ts                          (stays — consumed by mac, linux, and windows targets)
│   ├── macroExpander.ts
│   ├── normalizePackageData.ts
│   ├── packageMetadata.ts
│   ├── pathManager.ts
│   ├── rebuild.ts
│   ├── repositoryInfo.ts
│   ├── resolve.ts
│   ├── timer.ts
│   ├── toolsetLock.ts
│   ├── yarn.ts
│   ├── AppFileWalker.ts
│   ├── NodeModuleCopyHelper.ts
│   ├── appFileCopier.ts
│   ├── asyncEventEmitter.ts
│   └── dynamicImport.ts
│
└── [root src/ — unchanged]
    ├── macPackager.ts
    ├── winPackager.ts
    ├── linuxPackager.ts
    ├── platformPackager.ts
    ├── packager.ts
    ├── packagerApi.ts
    ├── configuration.ts
    ├── Framework.ts
    ├── core.ts
    ├── appInfo.ts
    ├── fileMatcher.ts
    ├── fileTransformer.ts
    ├── index.ts
    ├── indexInternal.ts
    ├── errorMessages.ts
    ├── version.ts
    ├── forge-maker.ts
    ├── presets/
    ├── options/
    ├── publish/
    ├── asar/
    └── node-module-collector/
```

---

## 4. Notes and Constraints

### `macosVersion.ts` is a build-host utility, not a macOS target utility
Even though it lives in `util/mac/`, it is imported by `targets/FpmTarget.ts` (Linux target) and `targets/nsis/NsisTarget.ts` (Windows target) to detect whether the **build machine** is running macOS. This is intentional and correct — the file's purpose is macOS host detection, making `util/mac/` the right location regardless of which target imports it.

### `plist.ts` and `resEdit.ts` are exported from `indexInternal.ts`
Both are part of the public-ish API. After the move, the re-export paths in `indexInternal.ts` must be updated. No external API surface changes; only internal path updates.

### `langs.ts` and `license.ts` stay in `util/`
`license.ts` is consumed by macOS (`targets/pkg.ts`), Linux (`FlatpakTarget`, `AppImageTarget`), and Windows (`nsisLicense.ts`). `langs.ts` is consumed by `license.ts` and NSIS. Neither is platform-specific; both stay flat in `util/`.

### Root-level packager files stay at `src/`
`macPackager.ts`, `winPackager.ts`, and `linuxPackager.ts` remain at the `src/` root. They are the primary entry points for each platform and are already clearly named. Moving them into a purpose subdirectory would add path depth with minimal benefit; they don't fit cleanly into any of the functional groupings (`codeSign/`, `electron/`, etc.).

### The root `mac/` directory dissolves
After `MacTargetHelper.ts` moves to `targets/mac/`, the root-level `src/mac/` directory is removed entirely. It was a half-started platform-first grouping that this plan supersedes.

### Import count estimate
All moves require mechanical import-path updates. Rough counts based on grep:
- `util/mac/macosIconComposer.ts`: 1 caller (`platformPackager.ts`)
- `util/mac/macosVersion.ts`: 3 callers (`macPackager.ts`, `targets/linux/FpmTarget.ts`, `targets/win/nsis/NsisTarget.ts`)
- `util/mac/plist.ts`: 3 callers (`electron/mac/electronMac.ts`, `targets/mac/pkg.ts`, `indexInternal.ts`)
- `util/win/resEdit.ts`: 2 callers (`winPackager.ts`, `indexInternal.ts`)
- `codeSign/mac/` and `codeSign/win/`: callers in `macPackager.ts`, `winPackager.ts`, `packager.ts`
- `electron/mac/` and `electron/win/`: callers in `macPackager.ts`, `winPackager.ts`, `ElectronFramework.ts`
- `vm/mac/`, `vm/win/`: callers in `macPackager.ts`, `winPackager.ts`, `toolsets/wine.ts`
- `toolsets/win/`, `toolsets/linux/`: callers in `winPackager.ts`, `linuxPackager.ts`, and targets

---

## 5. Execution Order

Execute in this sequence to minimize merge conflicts and broken intermediate states. Each step is independently compilable.

1. **`util/` platform-specific moves** — fewest callers, isolated from other steps
   - `util/macosIconComposer.ts` → `util/mac/macosIconComposer.ts`
   - `util/macosVersion.ts` → `util/mac/macosVersion.ts`
   - `util/plist.ts` → `util/mac/plist.ts`
   - `util/resEdit.ts` → `util/win/resEdit.ts`
   - Update all import sites + `indexInternal.ts` re-exports

2. **`codeSign/` platform split** — shared files stay flat, platform files drop into subdirs
   - `codeSign/macCodeSign.ts` → `codeSign/mac/macCodeSign.ts`
   - `codeSign/windowsCodeSign.ts` → `codeSign/win/windowsCodeSign.ts`
   - `codeSign/windowsSignAzureManager.ts` → `codeSign/win/windowsSignAzureManager.ts`
   - `codeSign/windowsSignToolManager.ts` → `codeSign/win/windowsSignToolManager.ts`

3. **`electron/` platform split**
   - `electron/electronMac.ts` → `electron/mac/electronMac.ts`
   - `electron/electronWin.ts` → `electron/win/electronWin.ts`

4. **`vm/` platform split**
   - `vm/ParallelsVm.ts` → `vm/mac/ParallelsVm.ts`
   - `vm/WineVm.ts` → `vm/win/WineVm.ts`
   - `vm/PwshVm.ts` → `vm/win/PwshVm.ts`

5. **`toolsets/` platform split**
   - `toolsets/nsis.ts` → `toolsets/win/nsis.ts`
   - `toolsets/winCodeSign.ts` → `toolsets/win/winCodeSign.ts`
   - `toolsets/wine.ts` → `toolsets/win/wine.ts`
   - `toolsets/appimage.ts` → `toolsets/linux/appimage.ts`
   - `toolsets/fpm.ts` → `toolsets/linux/fpm.ts`
   - `toolsets/linuxToolsMac.ts` → `toolsets/linux/linuxToolsMac.ts`

6. **`targets/` platform split + root `mac/` dissolution**
   - `targets/appimage/` → `targets/linux/appimage/`
   - `targets/snap/` → `targets/linux/snap/`
   - `targets/nsis/` → `targets/win/nsis/`
   - `targets/FlatpakTarget.ts` → `targets/linux/FlatpakTarget.ts`
   - `targets/FpmTarget.ts` → `targets/linux/FpmTarget.ts`
   - `targets/LinuxTargetHelper.ts` → `targets/linux/LinuxTargetHelper.ts`
   - `targets/AppxTarget.ts` → `targets/win/AppxTarget.ts`
   - `targets/AppxCapabilities.ts` → `targets/win/AppxCapabilities.ts`
   - `targets/MsiTarget.ts` → `targets/win/MsiTarget.ts`
   - `targets/MsiWrappedTarget.ts` → `targets/win/MsiWrappedTarget.ts`
   - `targets/pkg.ts` → `targets/mac/pkg.ts`
   - `mac/MacTargetHelper.ts` → `targets/mac/MacTargetHelper.ts`
   - Delete empty `src/mac/` directory

---

## 6. Verification

After each step:
- `pnpm compile` — must pass with no type errors (catches all broken import paths)
- `pnpm lint` — must pass
- `TEST_FILES=<affected area> pnpm ci:test` — run relevant tests

After all steps:
- `grep -r "from.*util/macosVersion\|from.*util/plist\|from.*util/resEdit\|from.*util/macosIconComposer" src/` — should match only the new `util/mac/` and `util/win/` paths, not flat `util/` paths
- `grep -r "from.*codeSign/macCodeSign\|from.*codeSign/windowsCodeSign" src/` — should match only `codeSign/mac/` and `codeSign/win/` paths
- `grep -r "from.*targets/nsis\|from.*targets/appimage\|from.*targets/snap" src/` — should match only `targets/win/nsis/`, `targets/linux/appimage/`, `targets/linux/snap/` paths
- `grep -r "from.*targets/FlatpakTarget\|from.*targets/FpmTarget\|from.*targets/AppxTarget\|from.*targets/MsiTarget\|from.*targets/pkg" src/` — should match only `targets/linux/` and `targets/win/` and `targets/mac/` paths
- Confirm `indexInternal.ts` re-exports still resolve correctly
- `ls src/mac` — directory should not exist

---

## 7. What This Does NOT Change

- `options/` — platform option files are fine at this level
- `node-module-collector/` — platform-agnostic, untouched
- `asar/` — shared, untouched
- Root-level packager files (`macPackager.ts`, `winPackager.ts`, `linuxPackager.ts`) — stay at `src/`
- Any public API signatures — only file locations change
- Any test files — paths update mechanically to match source moves

## 8. Future / Out of Scope

- **`options/` platform split** — `options/macOptions.ts`, `options/winOptions.ts`, `options/linuxOptions.ts` could gain the same treatment, but the file count is small and the names are already self-documenting.
