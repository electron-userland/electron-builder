## 2.19.0

### Features

* useMultipleRangeRequest option to disable using of multiple ranges request

## 2.18.2

### Bug Fixes

* **electron-updater:** AutoUpdate takes 60 seconds to fail validating signature on Windows 7 due to PowerShell version [#2421](https://github.com/electron-userland/electron-builder/issues/2421) ([da96e73](https://github.com/electron-userland/electron-builder/commit/da96e73))

## 2.18.1

### Bug Fixes

* **electron-updater:** add error codes ([2822049](https://github.com/electron-userland/electron-builder/commit/2822049)), closes [#2415](https://github.com/electron-userland/electron-builder/issues/2415)

## 2.18.0

### Bug Fixes

* **electron-updater:** redirect event in electron.net ([e2ac601](https://github.com/electron-userland/electron-builder/commit/e2ac601)), closes [#2374](https://github.com/electron-userland/electron-builder/issues/2374)
* use solid compression for web installer package ([6ea5668](https://github.com/electron-userland/electron-builder/commit/6ea5668))

## 2.17.2

### Bug Fixes

* Fix AppImage auto-update [#2240](https://github.com/electron-userland/electron-builder/issues/2240).

## 2.17.0

### Bug Fixes

* PrivateGitHubProvider requires at least Electron 1.6.11. Better to use latest stable.

### Features

* PrivateGitHubProvider [fixes](https://github.com/electron-userland/electron-builder/issues/2342).

## 2.16.2

### Features

* [Use the only HTTP request to download all changed blocks](https://github.com/electron-userland/electron-builder/releases/tag/v19.45.1).

## 2.16.0

### Features

* [Update metadata format allows several files](https://github.com/electron-userland/electron-builder/releases/tag/v19.44.0).

### Bug Fixes

*  Include application name in update notification ([#2262](https://github.com/electron-userland/electron-builder/issues/2262)) ([1809c94](https://github.com/electron-userland/electron-builder/commit/1809c94))

## 2.13.0

### Features

* full changelog for all versions from current to latest ([67fe9ff](https://github.com/electron-userland/electron-builder/commit/67fe9ff))

## 2.12.1

### Performance Improvements

* a little bit more compact blockmap data ([c92bc38](https://github.com/electron-userland/electron-builder/commit/c92bc38))

## 2.12.0

### Features

* [Linux auto-update](https://github.com/electron-userland/electron-builder/releases/tag/v19.37.0)

## 2.11.0

### Features

* Differential updater: use [content defined chunking](https://github.com/electron-userland/electron-builder/releases/tag/v19.36.0)

## 2.10.2

### Bug Fixes

* Differential updater: fix "To download" in percentage value calculation (cosmetic fix)

## 2.10.1

### Bug Fixes

* PrivateGitHubProvider: clear error if no channel file in the latest github release

# 2.10.0 (2017-09-22)

### Features

* [DigitalOcean Spaces support](https://github.com/electron-userland/electron-builder/releases/tag/v19.30.0).

# 2.9.3 (2017-09-10)

### Features

* [Delta updates for Windows Web Installer](https://github.com/electron-userland/electron-builder/releases/tag/v19.28.4).


## 2.8.9 (2017-09-01)

### Bug Fixes

* Electron-updater does not support enterprise Github. [#1903](https://github.com/electron-userland/electron-builder/issues/1903).

## 2.8.8 (2017-09-01)

### Bug Fixes

* handle aborted event. [#1975](https://github.com/electron-userland/electron-builder/issues/1975).