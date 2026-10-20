---
"electron-updater": major
---

refactor(updater): `downloadUpdate()` and `UpdateCheckResult.downloadPromise` resolve with a `DownloadExecutorResult` object instead of a positional `Array<string>`

BREAKING CHANGE: the promise returned by `AppUpdater.downloadUpdate()` (and `UpdateCheckResult.downloadPromise` when `autoDownload` is enabled) now resolves with `{ updateFile, packageFile? }` instead of `[updateFile]` / `[updateFile, packageFile]`. The array shape depended on element order to tell the installer apart from the optional NSIS web-installer package; the new `DownloadExecutorResult` type (exported from `electron-updater`) names both files. `UpdateDownloadedEvent` additionally gains an optional `packageFile` field for web installers.

```ts
// Before (v6)
const files = await autoUpdater.downloadUpdate()
const installer = files[0]
const webInstallerPackage = files[1] // only for NSIS web installers

// After (v7)
const { updateFile, packageFile } = await autoUpdater.downloadUpdate()
```

The same applies to the result of `checkForUpdates()`:

```ts
// Before (v6)
const result = await autoUpdater.checkForUpdates()
const [installer] = (await result?.downloadPromise) ?? []

// After (v7)
const result = await autoUpdater.checkForUpdates()
const download = await result?.downloadPromise
const installer = download?.updateFile
```

The underlying cache-consistency fix from #10098 already produced this object internally; this change stops converting it back to an array at the public API boundary.
