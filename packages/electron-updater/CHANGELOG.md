## 3.0.2

### Bug Fixes

* **electron-updater:** addRandomQueryToAvoidCaching does not respect query parameters

## 3.0.1

### Bug Fixes

* **electron-updater:** Replace all occurrences of version in old blockmap file url ([#3120](https://github.com/electron-userland/electron-builder/issues/3120)) ([ca18b74](https://github.com/electron-userland/electron-builder/commit/ca18b74))
* **electron-updater:** vertical upgrading for channels ([b1f2272](https://github.com/electron-userland/electron-builder/commit/b1f2272)), closes [#3111](https://github.com/electron-userland/electron-builder/issues/3111)

## 2.23.3

* **electron-updater:** fix case of blockmap file extension, detect s3 urls on setFeedURL ([369e9c0](https://github.com/electron-userland/electron-builder/commit/369e9c0))
* **electron-updater:** ignore unknown powershell errors ([a0026a7](https://github.com/electron-userland/electron-builder/commit/a0026a7)), closes [#2589](https://github.com/electron-userland/electron-builder/issues/2589)
* **electron-updater:** web installer differential download perMachine ([82708a5](https://github.com/electron-userland/electron-builder/commit/82708a5)), closes [#2949](https://github.com/electron-userland/electron-builder/issues/2949)


## 2.23.2

### Bug Fixes

* **electron-updater:** addRandomQueryToAvoidCaching breaks s3 provider for updater with private acl ([577b61b](https://github.com/electron-userland/electron-builder/commit/577b61b)), closes [#3021](https://github.com/electron-userland/electron-builder/issues/3021)


## 2.23.1

### Features

* **electron-updater:** [Delta updates for NSIS](https://github.com/electron-userland/electron-builder/releases/tag/v20.17.0) target ([7dd59fb](https://github.com/electron-userland/electron-builder/commit/7dd59fb)), closes [#2217](https://github.com/electron-userland/electron-builder/issues/2217) [#3042](https://github.com/electron-userland/electron-builder/issues/3042) [#3000](https://github.com/electron-userland/electron-builder/issues/3000) [#2977](https://github.com/electron-userland/electron-builder/issues/2977)
* **electron-updater:** support prereleases in a Github private repository ([59aac66](https://github.com/electron-userland/electron-builder/commit/59aac66)), closes [#3005](https://github.com/electron-userland/electron-builder/issues/3005) [#3037](https://github.com/electron-userland/electron-builder/issues/3037)
* **electron-updater:** cache downloaded update and reuse if valid later ([ba4809a](https://github.com/electron-userland/electron-builder/commit/ba4809a))
* **electron-updater:** electron-updater will update even I don't call quitAndInstall after app quit ([29f1c10](https://github.com/electron-userland/electron-builder/commit/29f1c10)), closes [#2493](https://github.com/electron-userland/electron-builder/issues/2493)

### Bug Fixes
* **electron-updater:** do not rename AppImage file if no version in the name ([48a0811](https://github.com/electron-userland/electron-builder/commit/48a0811)), closes [#2964](https://github.com/electron-userland/electron-builder/issues/2964)
* **electron-updater:** downloading builds(updates) more than once even if downloaded already ([6500b35](https://github.com/electron-userland/electron-builder/commit/6500b35)), closes [#3007](https://github.com/electron-userland/electron-builder/issues/3007) [#3003](https://github.com/electron-userland/electron-builder/issues/3003)
* **electron-updater:** set _packageFile to null on clear ([7fe72da](https://github.com/electron-userland/electron-builder/commit/7fe72da))
* **electron-updater:** Prevent download notification queueing ([68804e4](https://github.com/electron-userland/electron-builder/commit/68804e4)), closes [#2850](https://github.com/electron-userland/electron-builder/issues/2850)
* **electron-updater:** add random query param to avoid caching ([254d7c5](https://github.com/electron-userland/electron-builder/commit/254d7c5)), closes [#2741](https://github.com/electron-userland/electron-builder/issues/2741)
* **electron-updater:** Close opened parenthese in update checking log ([8f19ea9](https://github.com/electron-userland/electron-builder/commit/8f19ea9)), closes [#2763](https://github.com/electron-userland/electron-builder/issues/2763)
* **electron-updater:** set actual http status code instead of 404 [#2741](https://github.com/electron-userland/electron-builder/issues/2741) ([8453a77](https://github.com/electron-userland/electron-builder/commit/8453a77))
* **electron-updater:** return correct release notes & name ([#2743](https://github.com/electron-userland/electron-builder/issues/2743)) ([37014be](https://github.com/electron-userland/electron-builder/commit/37014be)), closes [#2742](https://github.com/electron-userland/electron-builder/issues/2742)
* **electron-updater:** Allow --package-file arg to escape spaces in filenames ([#2739](https://github.com/electron-userland/electron-builder/issues/2739)) ([24a585b](https://github.com/electron-userland/electron-builder/commit/24a585b))
* **electron-updater:** Race condition during Application Quit ([#2746](https://github.com/electron-userland/electron-builder/issues/2746)) ([1df5d98](https://github.com/electron-userland/electron-builder/commit/1df5d98)), closes [#2745](https://github.com/electron-userland/electron-builder/issues/2745)
* **electron-updater:** use updateInfo.path as AppImage installer name ([#2722](https://github.com/electron-userland/electron-builder/issues/2722)) ([8233eae](https://github.com/electron-userland/electron-builder/commit/8233eae)), closes [#2672](https://github.com/electron-userland/electron-builder/issues/2672)
* **electron-updater:** add response code to error message about Accept-Ranges ([62cf1df](https://github.com/electron-userland/electron-builder/commit/62cf1df))
* **electron-updater:** Nsis app from fall 2017 (electron-updater 2.10.0) won't update to new version ([ba2957e](https://github.com/electron-userland/electron-builder/commit/ba2957e)), closes [#2583](https://github.com/electron-userland/electron-builder/issues/2583)
* **electron-updater:** recurrent 404 Errors on GitHub Enterprise ([afc1a9e](https://github.com/electron-userland/electron-builder/commit/afc1a9e))


## 2.19.0

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