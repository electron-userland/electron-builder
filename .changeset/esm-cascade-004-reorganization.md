---
"app-builder-lib": minor
---

refactor(targets,vm,codeSign,electron,util): reorganize platform-specific files into subdirectories

## Summary

This changeset moves all platform-specific source files into dedicated subdirectories, establishing a consistent directory convention for the entire codebase.

### Target reorganization

| Old path | New path |
|---|---|
| `src/targets/AppxTarget.ts` | `src/targets/win/AppxTarget.ts` |
| `src/targets/AppxCapabilities.ts` | `src/targets/win/AppxCapabilities.ts` |
| `src/targets/MsiTarget.ts` | `src/targets/win/MsiTarget.ts` |
| `src/targets/MsiWrappedTarget.ts` | `src/targets/win/MsiWrappedTarget.ts` |
| `src/targets/nsis/` (all files) | `src/targets/win/nsis/` |
| `src/targets/FlatpakTarget.ts` | `src/targets/linux/FlatpakTarget.ts` |
| `src/targets/FpmTarget.ts` | `src/targets/linux/FpmTarget.ts` |
| `src/targets/LinuxTargetHelper.ts` | `src/targets/linux/LinuxTargetHelper.ts` |
| `src/targets/appimage/` (all files) | `src/targets/linux/appimage/` |
| `src/targets/snap/` (all files) | `src/targets/linux/snap/` |
| `src/targets/pkg.ts` | `src/targets/mac/pkg.ts` |
| `src/mac/MacTargetHelper.ts` | `src/targets/mac/MacTargetHelper.ts` |

### VM reorganization (from cascade-004 earlier commits)

| Old path | New path |
|---|---|
| `src/vm/ParallelsVm.ts` | `src/vm/mac/ParallelsVm.ts` |
| `src/vm/WineVm.ts` | `src/vm/win/WineVm.ts` |
| `src/vm/PwshVm.ts` | `src/vm/win/PwshVm.ts` |

### Code-signing reorganization

| Old path | New path |
|---|---|
| `src/codeSign/macCodeSign.ts` | `src/codeSign/mac/macCodeSign.ts` |
| `src/codeSign/certInfo.ts` | `src/codeSign/mac/certInfo.ts` |
| `src/codeSign/codesign.ts` | `src/codeSign/mac/codesign.ts` |
| `src/codeSign/windowsCodeSign.ts` | `src/codeSign/win/windowsCodeSign.ts` |
| `src/codeSign/windowsSignAzureManager.ts` | `src/codeSign/win/windowsSignAzureManager.ts` |
| `src/codeSign/windowsSignToolManager.ts` | `src/codeSign/win/windowsSignToolManager.ts` |

### Electron helper reorganization

| Old path | New path |
|---|---|
| `src/electron/electronMac.ts` | `src/electron/mac/electronMac.ts` |
| `src/electron/electronWin.ts` | `src/electron/win/electronWin.ts` |

### Util reorganization

| Old path | New path |
|---|---|
| `src/util/macosIconComposer.ts` | `src/util/mac/macosIconComposer.ts` |
| `src/util/macosVersion.ts` | `src/util/mac/macosVersion.ts` |
| `src/util/plist.ts` | `src/util/mac/plist.ts` |
| `src/util/resEdit.ts` | `src/util/win/resEdit.ts` |

### Toolset reorganization

| Old path | New path |
|---|---|
| `src/toolsets/wine.ts` | `src/toolsets/win/wine.ts` |

> Note: `src/toolsets/linux.ts` and `src/toolsets/windows.ts` remain flat (toolset split files from the source branch were superseded by cascade-002's merged flat files).

## Changed Files

All import paths in consuming files updated accordingly. `indexInternal.ts` exports updated. Test files referencing moved modules updated to new paths.

## Validation

- `pnpm compile` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm typecheck:test` — exit 0
