## 4.3.0

### Bug Fixes

* Remove dependency on pako module, use native API instead.

## 4.2.0

### Bug Fixes

* Forbid using of quotes in a file names.

## 4.2.0

### Bug Fixes

* when AllowDowngrade is true and latest version is older, take the update ([#4218](https://github.com/electron-userland/electron-builder/issues/4218)) ([5bf4498](https://github.com/electron-userland/electron-builder/commit/5bf4498))

### Features

* export updaters for configurability ([#4250](https://github.com/electron-userland/electron-builder/issues/4250)) ([9df845e](https://github.com/electron-userland/electron-builder/commit/9df845e))

## 4.1.2

### Features

* expose `isUpdaterActive`, closes [#4028](https://github.com/electron-userland/electron-builder/issues/4028)

### Bug Fixes

* cannot download differentially: Error: Maximum allowed size is 5 MB ([c5c2eeb](https://github.com/electron-userland/electron-builder/commit/c5c2eeb)), closes [#3564](https://github.com/electron-userland/electron-builder/issues/3564)
* reduce electron-updater size ([8025fb4](https://github.com/electron-userland/electron-builder/commit/8025fb4)), closes [#3953](https://github.com/electron-userland/electron-builder/issues/3953)

## 4.0.14

From 4.0.5 to 4.0.13 — maintenance-only releases to update dependencies.

### Bug Fixes

* update from prerelease to prerelease crash, closes [#3163](https://github.com/electron-userland/electron-builder/issues/3163)

## 4.0.5

### Bug Fixes

* disable differential download operation validation for now, closes [#3485](https://github.com/electron-userland/electron-builder/issues/3485)

## 4.0.0

### BREAKING CHANGES

* Requires Electron 3 or later.
* Cache directory changed, so, full download will be performed on update instead of differential.

### Bug Fixes

* use cache dir for electron-updater cache data

### Features

* decouple Electron API to support Proton and other frameworks

## 3.2.3

### Bug Fixes

* fix recent differential update regression ([d9341d6](https://github.com/electron-userland/electron-builder/commit/d9341d6))

### Features

* expose downloaded file in update-downloaded event ([7cdece3](https://github.com/electron-userland/electron-builder/commit/7cdece3)), closes [#3070](https://github.com/electron-userland/electron-builder/issues/3070) [#3345](https://github.com/electron-userland/electron-builder/issues/3345)

## 3.2.1

### Bug Fixes

* Updater crash on windows, fails on MacOS X ([76fdd42](https://github.com/electron-userland/electron-builder/commit/76fdd42)), closes [#3308](https://github.com/electron-userland/electron-builder/issues/3308) [#3377](https://github.com/electron-userland/electron-builder/issues/3377)
* **electron-updater:** do not dispatch error event for CancellationError [#1150](https://github.com/electron-userland/electron-builder/issues/1150) ([e7acbd9](https://github.com/electron-userland/electron-builder/commit/e7acbd9))

## 3.1.4

### Bug Fixes

* Fix grammar in notification message ([#3410](https://github.com/electron-userland/electron-builder/issues/3410)) ([7953e56](https://github.com/electron-userland/electron-builder/commit/7953e56))
* remove escaping of package-path arg - node escapes it properly ([c7e07cc](https://github.com/electron-userland/electron-builder/commit/c7e07cc))

## 3.1.3

### Bug Fixes

* close files more reliably during differential download ([d37bacb](https://github.com/electron-userland/electron-builder/commit/d37bacb))
* Added electron 3(Node 10) support to nsis updater ([78a65d2](https://github.com/electron-userland/electron-builder/commit/78a65d2)), closes [#3371](https://github.com/electron-userland/electron-builder/issues/3371)
* better escaping of package-path arg ([44c8fd0](https://github.com/electron-userland/electron-builder/commit/44c8fd0))

## 3.1.1

### Bug Fixes

* url parameters, search is inside ([d553629](https://github.com/electron-userland/electron-builder/commit/d553629))
* partially restore sha256 support ([6f8e4ec](https://github.com/electron-userland/electron-builder/commit/6f8e4ec)), closes [#3137](https://github.com/electron-userland/electron-builder/issues/3137)
* unify "update-downloaded" event on macOS ([86d64c2](https://github.com/electron-userland/electron-builder/commit/86d64c2))

### Features

* download update on macOS in the same way as for other OS ([f966f1a](https://github.com/electron-userland/electron-builder/commit/f966f1a)), closes [#3168](https://github.com/electron-userland/electron-builder/issues/3168)

## 3.0.2

### Bug Fixes

* addRandomQueryToAvoidCaching does not respect query parameters

## 3.0.1

### Bug Fixes

* Replace all occurrences of version in old blockmap file url ([#3120](https://github.com/electron-userland/electron-builder/issues/3120)) ([ca18b74](https://github.com/electron-userland/electron-builder/commit/ca18b74))
* vertical upgrading for channels ([b1f2272](https://github.com/electron-userland/electron-builder/commit/b1f2272)), closes [#3111](https://github.com/electron-userland/electron-builder/issues/3111)

## 2.23.3

* fix case of blockmap file extension, detect s3 urls on setFeedURL ([369e9c0](https://github.com/electron-userland/electron-builder/commit/369e9c0))
* ignore unknown powershell errors ([a0026a7](https://github.com/electron-userland/electron-builder/commit/a0026a7)), closes [#2589](https://github.com/electron-userland/electron-builder/issues/2589)
* web installer differential download perMachine ([82708a5](https://github.com/electron-userland/electron-builder/commit/82708a5)), closes [#2949](https://github.com/electron-userland/electron-builder/issues/2949)


## 2.23.2

### Bug Fixes

* addRandomQueryToAvoidCaching breaks s3 provider for updater with private acl ([577b61b](https://github.com/electron-userland/electron-builder/commit/577b61b)), closes [#3021](https://github.com/electron-userland/electron-builder/issues/3021)


## 2.23.1

### Features

* [Delta updates for NSIS](https://github.com/electron-userland/electron-builder/releases/tag/v20.17.0) target ([7dd59fb](https://github.com/electron-userland/electron-builder/commit/7dd59fb)), closes [#2217](https://github.com/electron-userland/electron-builder/issues/2217) [#3042](https://github.com/electron-userland/electron-builder/issues/3042) [#3000](https://github.com/electron-userland/electron-builder/issues/3000) [#2977](https://github.com/electron-userland/electron-builder/issues/2977)
* support prereleases in a Github private repository ([59aac66](https://github.com/electron-userland/electron-builder/commit/59aac66)), closes [#3005](https://github.com/electron-userland/electron-builder/issues/3005) [#3037](https://github.com/electron-userland/electron-builder/issues/3037)
* cache downloaded update and reuse if valid later ([ba4809a](https://github.com/electron-userland/electron-builder/commit/ba4809a))
* electron-updater will update even I don't call quitAndInstall after app quit ([29f1c10](https://github.com/electron-userland/electron-builder/commit/29f1c10)), closes [#2493](https://github.com/electron-userland/electron-builder/issues/2493)

### Bug Fixes
* do not rename AppImage file if no version in the name ([48a0811](https://github.com/electron-userland/electron-builder/commit/48a0811)), closes [#2964](https://github.com/electron-userland/electron-builder/issues/2964)
* downloading builds(updates) more than once even if downloaded already ([6500b35](https://github.com/electron-userland/electron-builder/commit/6500b35)), closes [#3007](https://github.com/electron-userland/electron-builder/issues/3007) [#3003](https://github.com/electron-userland/electron-builder/issues/3003)
* set _packageFile to null on clear ([7fe72da](https://github.com/electron-userland/electron-builder/commit/7fe72da))
* Prevent download notification queueing ([68804e4](https://github.com/electron-userland/electron-builder/commit/68804e4)), closes [#2850](https://github.com/electron-userland/electron-builder/issues/2850)
* add random query param to avoid caching ([254d7c5](https://github.com/electron-userland/electron-builder/commit/254d7c5)), closes [#2741](https://github.com/electron-userland/electron-builder/issues/2741)
* Close opened parenthese in update checking log ([8f19ea9](https://github.com/electron-userland/electron-builder/commit/8f19ea9)), closes [#2763](https://github.com/electron-userland/electron-builder/issues/2763)
* set actual http status code instead of 404 [#2741](https://github.com/electron-userland/electron-builder/issues/2741) ([8453a77](https://github.com/electron-userland/electron-builder/commit/8453a77))
* return correct release notes & name ([#2743](https://github.com/electron-userland/electron-builder/issues/2743)) ([37014be](https://github.com/electron-userland/electron-builder/commit/37014be)), closes [#2742](https://github.com/electron-userland/electron-builder/issues/2742)
* Allow --package-file arg to escape spaces in filenames ([#2739](https://github.com/electron-userland/electron-builder/issues/2739)) ([24a585b](https://github.com/electron-userland/electron-builder/commit/24a585b))
* Race condition during Application Quit ([#2746](https://github.com/electron-userland/electron-builder/issues/2746)) ([1df5d98](https://github.com/electron-userland/electron-builder/commit/1df5d98)), closes [#2745](https://github.com/electron-userland/electron-builder/issues/2745)
* use updateInfo.path as AppImage installer name ([#2722](https://github.com/electron-userland/electron-builder/issues/2722)) ([8233eae](https://github.com/electron-userland/electron-builder/commit/8233eae)), closes [#2672](https://github.com/electron-userland/electron-builder/issues/2672)
* add response code to error message about Accept-Ranges ([62cf1df](https://github.com/electron-userland/electron-builder/commit/62cf1df))
* Nsis app from fall 2017 (electron-updater 2.10.0) won't update to new version ([ba2957e](https://github.com/electron-userland/electron-builder/commit/ba2957e)), closes [#2583](https://github.com/electron-userland/electron-builder/issues/2583)
* recurrent 404 Errors on GitHub Enterprise ([afc1a9e](https://github.com/electron-userland/electron-builder/commit/afc1a9e))


## 2.19.0

## 2.19.0

### Features

* useMultipleRangeRequest option to disable using of multiple ranges request

## 2.18.2

### Bug Fixes

* AutoUpdate takes 60 seconds to fail validating signature on Windows 7 due to PowerShell version [#2421](https://github.com/electron-userland/electron-builder/issues/2421) ([da96e73](https://github.com/electron-userland/electron-builder/commit/da96e73))

## 2.18.1

### Bug Fixes

* add error codes ([2822049](https://github.com/electron-userland/electron-builder/commit/2822049)), closes [#2415](https://github.com/electron-userland/electron-builder/issues/2415)

## 2.18.0

### Bug Fixes

* redirect event in electron.net ([e2ac601](https://github.com/electron-userland/electron-builder/commit/e2ac601)), closes [#2374](https://github.com/electron-userland/electron-builder/issues/2374)
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