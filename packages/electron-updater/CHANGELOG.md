## 4.3.0

## 5.0.3

### Patch Changes

- [#6810](https://github.com/electron-userland/electron-builder/pull/6810) [`817e68ba`](https://github.com/electron-userland/electron-builder/commit/817e68ba54f4fa60fec789fcfcfb527473a610fc) Thanks [@blakebyrnes](https://github.com/blakebyrnes)! - fix: github provider prerelease check incorrectly casts undefined to String. Resolves #6809

- Updated dependencies [[`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43)]:
  - builder-util-runtime@9.0.2

## 5.0.2

### Patch Changes

- [`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441) - chore: updating dependency tree

- Updated dependencies [[`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441)]:
  - builder-util-runtime@9.0.1

## 5.0.1

### Patch Changes

- [#6743](https://github.com/electron-userland/electron-builder/pull/6743) [`27f18aa1`](https://github.com/electron-userland/electron-builder/commit/27f18aa1d890f3a82e856f4834b8387066fb697f) Thanks [@YanDevDe](https://github.com/YanDevDe)! - fix: Updater "Error: Could not connect to the server." in macOS. Don't close server directly at quitAndInstall #6743

## 5.0.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

* [#6575](https://github.com/electron-userland/electron-builder/pull/6575) [`5e381c55`](https://github.com/electron-userland/electron-builder/commit/5e381c556d12ce185bb7ea720380509c1ddc5cf7) Thanks [@devinbinnie](https://github.com/devinbinnie)! - fix: Allow disabling of webinstaller files to avoid confusion with actual installers

- [#6576](https://github.com/electron-userland/electron-builder/pull/6576) [`53467c72`](https://github.com/electron-userland/electron-builder/commit/53467c724dacc11fc270cebaba22f8cf84dff24f) Thanks [@devinbinnie](https://github.com/devinbinnie)! - fix: Update certificate validation on Windows to check full DN

### Minor Changes

- [#6505](https://github.com/electron-userland/electron-builder/pull/6505) [`1de0adbd`](https://github.com/electron-userland/electron-builder/commit/1de0adbd615b3b3d26faeb6a449f522355b36041) Thanks [@KenCorma](https://github.com/KenCorma)! - feat(updater): Add Channel Support for Github with PreRelease

### Patch Changes

- [#6594](https://github.com/electron-userland/electron-builder/pull/6594) [`edc4b030`](https://github.com/electron-userland/electron-builder/commit/edc4b030703ee3929b31608a496798635169f5b1) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(updater): Replacing fs/promises with fs-extra to support legacy versions of Electron that use node 12 and below. Fixes: #6000

* [#6587](https://github.com/electron-userland/electron-builder/pull/6587) [`8746f910`](https://github.com/electron-userland/electron-builder/commit/8746f910d136fb9b531e688d0a646eeb9528adc6) Thanks [@devinbinnie](https://github.com/devinbinnie)! - fix: fixes for server auth for MacUpdater

- [#6589](https://github.com/electron-userland/electron-builder/pull/6589) [`633ee5dc`](https://github.com/electron-userland/electron-builder/commit/633ee5dc292174ed1486c53af93320f20cf02169) Thanks [@devinbinnie](https://github.com/devinbinnie)! - - Removed backtick escaping for Windows code signing as it is unnecessary for Powershell and can cause the script to attempt to access the wrong file
  - Updated the proxy filename to be more secure (512-bit string)

* [#6616](https://github.com/electron-userland/electron-builder/pull/6616) [`86e6d150`](https://github.com/electron-userland/electron-builder/commit/86e6d1509f9b9c76c559e9c3a12b7a1595fe3ac4) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(updater): Remove checks for app-update.yml when auto-updates are not supported

* Updated dependencies [[`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - builder-util-runtime@9.0.0

## 5.0.0-alpha.4

### Patch Changes

- [#6616](https://github.com/electron-userland/electron-builder/pull/6616) [`86e6d150`](https://github.com/electron-userland/electron-builder/commit/86e6d1509f9b9c76c559e9c3a12b7a1595fe3ac4) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(updater): Remove checks for app-update.yml when auto-updates are not supported

## 5.0.0-alpha.3

### Patch Changes

- [#6594](https://github.com/electron-userland/electron-builder/pull/6594) [`edc4b030`](https://github.com/electron-userland/electron-builder/commit/edc4b030703ee3929b31608a496798635169f5b1) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(updater): Replacing fs/promises with fs-extra to support legacy versions of Electron that use node 12 and below. Fixes: #6000

* [#6589](https://github.com/electron-userland/electron-builder/pull/6589) [`633ee5dc`](https://github.com/electron-userland/electron-builder/commit/633ee5dc292174ed1486c53af93320f20cf02169) Thanks [@devinbinnie](https://github.com/devinbinnie)! - - Removed backtick escaping for Windows code signing as it is unnecessary for Powershell and can cause the script to attempt to access the wrong file
  - Updated the proxy filename to be more secure (512-bit string)

## 5.0.0-alpha.2

### Minor Changes

- [#6505](https://github.com/electron-userland/electron-builder/pull/6505) [`1de0adbd`](https://github.com/electron-userland/electron-builder/commit/1de0adbd615b3b3d26faeb6a449f522355b36041) Thanks [@KenCorma](https://github.com/KenCorma)! - feat(updater): Add Channel Support for Github with PreRelease

### Patch Changes

- [#6587](https://github.com/electron-userland/electron-builder/pull/6587) [`8746f910`](https://github.com/electron-userland/electron-builder/commit/8746f910d136fb9b531e688d0a646eeb9528adc6) Thanks [@devinbinnie](https://github.com/devinbinnie)! - fix: fixes for server auth for MacUpdater

## 5.0.0-alpha.1

### Major Changes

- [#6575](https://github.com/electron-userland/electron-builder/pull/6575) [`5e381c55`](https://github.com/electron-userland/electron-builder/commit/5e381c556d12ce185bb7ea720380509c1ddc5cf7) Thanks [@devinbinnie](https://github.com/devinbinnie)! - fix: Allow disabling of webinstaller files to avoid confusion with actual installers

* [#6576](https://github.com/electron-userland/electron-builder/pull/6576) [`53467c72`](https://github.com/electron-userland/electron-builder/commit/53467c724dacc11fc270cebaba22f8cf84dff24f) Thanks [@devinbinnie](https://github.com/devinbinnie)! - fix: Update certificate validation on Windows to check full DN

## 5.0.0-alpha.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

### Patch Changes

- Updated dependencies [[`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - builder-util-runtime@9.0.0-alpha.0

## 4.6.5

### Patch Changes

- [#6381](https://github.com/electron-userland/electron-builder/pull/6381) [`828fcd37`](https://github.com/electron-userland/electron-builder/commit/828fcd378c2df28763893ef68f92d5b1a72fead3) Thanks [@zhanjinfeng](https://github.com/zhanjinfeng)! - fix: use `uname -a` to get arch instead of 'process.arch' in mac silicon

## 4.6.4

### Patch Changes

- [#6450](https://github.com/electron-userland/electron-builder/pull/6450) [`661a6522`](https://github.com/electron-userland/electron-builder/commit/661a6522520e9ea59549cb7e18986fcfb58e873a) Thanks [@robertpatrick](https://github.com/robertpatrick)! - fix(nsis): fix per-machine installs to properly elevate during silent install/updates

## 4.6.3

### Patch Changes

- [#6395](https://github.com/electron-userland/electron-builder/pull/6395) [`3c38af42`](https://github.com/electron-userland/electron-builder/commit/3c38af4288908abeea1be1f245d9e3db6c62b227) Thanks [@Nokel81](https://github.com/Nokel81)! - Emulate electron.autoUpdater's event lifecycle for AppImageUpdater

## 4.6.2

### Patch Changes

- [#6390](https://github.com/electron-userland/electron-builder/pull/6390) [`a5e8073e`](https://github.com/electron-userland/electron-builder/commit/a5e8073e21b1ff791905cdb4ab011a724533d8c1) Thanks [@Nokel81](https://github.com/Nokel81)! - Fix updating only on demand not working on macOS

- Updated dependencies [[`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3)]:
  - builder-util-runtime@8.9.2

## 4.6.1

### Patch Changes

- Updated dependencies [[`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff)]:
  - builder-util-runtime@8.9.1

## 4.6.0

### Minor Changes

- [#6228](https://github.com/electron-userland/electron-builder/pull/6228) [`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: adding Bitbucket publisher and autoupdater

### Patch Changes

- Updated dependencies [[`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8)]:
  - builder-util-runtime@8.9.0

## 4.5.2

### Patch Changes

- [#6212](https://github.com/electron-userland/electron-builder/pull/6212) [`0c21cd69`](https://github.com/electron-userland/electron-builder/commit/0c21cd69663a7eebe0687eaba9eea851cc2fea9e) Thanks [@johnnyopao](https://github.com/johnnyopao)! - Fix upgrade flows on intel mac when both x64 and arm64 versions published

## 4.5.1

### Patch Changes

- Updated dependencies [[`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e)]:
  - builder-util-runtime@8.8.1

## 4.5.0

### Minor Changes

- [#6167](https://github.com/electron-userland/electron-builder/pull/6167) [`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding Keygen as an official publisher/updater for electron-builder (#6167)

### Patch Changes

- Updated dependencies [[`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f)]:
  - builder-util-runtime@8.8.0

## 4.4.6

### Patch Changes

- a3c72b24: fix(electron-updater): workaround vite's process.env.\* replacement
- ca0e8454: fix(electron-updater): `null` object error when MacUpdater attempts to log the server port before it is listening

## 4.4.5

### Patch Changes

- a3f2cd15: fix(electron-updater): default import throws error for fs and path leading to always requiring elevation
- ae363e51: fix: removing data from error being thrown. It's unnecessary and also unnecessarily large to be passing to the console. Resolves: #6131

## 4.4.4

### Patch Changes

- ae81dfae: fix(electron-updater): small cleanup and add more debug logging for MacUpdater to investigate #6120

## 4.4.3

### Patch Changes

- a4eae34f: Synchronizing CLI and package.json versions. Updating auto-publish values + changeset generation to be more frictionless
- Updated dependencies [a4eae34f]
  - builder-util-runtime@8.7.10

## 4.4.2

### Patch Changes

- 878671d0: Updating patch number as many deps were updated as parted of RenovateBot integration
- Updated dependencies [878671d0]
  - builder-util-runtime@8.7.9

## 4.4.1

### Patch Changes

- 1272afc5: Initial introduction of changset config
- Updated dependencies [1272afc5]
  - builder-util-runtime@8.7.8

### Bug Fixes

- Remove dependency on pako module, use native API instead.

## 4.2.0

### Bug Fixes

- Forbid using of quotes in a file names.

## 4.2.0

### Bug Fixes

- when AllowDowngrade is true and latest version is older, take the update ([#4218](https://github.com/electron-userland/electron-builder/issues/4218)) ([5bf4498](https://github.com/electron-userland/electron-builder/commit/5bf4498))

### Features

- export updaters for configurability ([#4250](https://github.com/electron-userland/electron-builder/issues/4250)) ([9df845e](https://github.com/electron-userland/electron-builder/commit/9df845e))

## 4.1.2

### Features

- expose `isUpdaterActive`, closes [#4028](https://github.com/electron-userland/electron-builder/issues/4028)

### Bug Fixes

- cannot download differentially: Error: Maximum allowed size is 5 MB ([c5c2eeb](https://github.com/electron-userland/electron-builder/commit/c5c2eeb)), closes [#3564](https://github.com/electron-userland/electron-builder/issues/3564)
- reduce electron-updater size ([8025fb4](https://github.com/electron-userland/electron-builder/commit/8025fb4)), closes [#3953](https://github.com/electron-userland/electron-builder/issues/3953)

## 4.0.14

From 4.0.5 to 4.0.13 — maintenance-only releases to update dependencies.

### Bug Fixes

- update from prerelease to prerelease crash, closes [#3163](https://github.com/electron-userland/electron-builder/issues/3163)

## 4.0.5

### Bug Fixes

- disable differential download operation validation for now, closes [#3485](https://github.com/electron-userland/electron-builder/issues/3485)

## 4.0.0

### BREAKING CHANGES

- Requires Electron 3 or later.
- Cache directory changed, so, full download will be performed on update instead of differential.

### Bug Fixes

- use cache dir for electron-updater cache data

### Features

- decouple Electron API to support Proton and other frameworks

## 3.2.3

### Bug Fixes

- fix recent differential update regression ([d9341d6](https://github.com/electron-userland/electron-builder/commit/d9341d6))

### Features

- expose downloaded file in update-downloaded event ([7cdece3](https://github.com/electron-userland/electron-builder/commit/7cdece3)), closes [#3070](https://github.com/electron-userland/electron-builder/issues/3070) [#3345](https://github.com/electron-userland/electron-builder/issues/3345)

## 3.2.1

### Bug Fixes

- Updater crash on windows, fails on MacOS X ([76fdd42](https://github.com/electron-userland/electron-builder/commit/76fdd42)), closes [#3308](https://github.com/electron-userland/electron-builder/issues/3308) [#3377](https://github.com/electron-userland/electron-builder/issues/3377)
- **electron-updater:** do not dispatch error event for CancellationError [#1150](https://github.com/electron-userland/electron-builder/issues/1150) ([e7acbd9](https://github.com/electron-userland/electron-builder/commit/e7acbd9))

## 3.1.4

### Bug Fixes

- Fix grammar in notification message ([#3410](https://github.com/electron-userland/electron-builder/issues/3410)) ([7953e56](https://github.com/electron-userland/electron-builder/commit/7953e56))
- remove escaping of package-path arg - node escapes it properly ([c7e07cc](https://github.com/electron-userland/electron-builder/commit/c7e07cc))

## 3.1.3

### Bug Fixes

- close files more reliably during differential download ([d37bacb](https://github.com/electron-userland/electron-builder/commit/d37bacb))
- Added electron 3(Node 10) support to nsis updater ([78a65d2](https://github.com/electron-userland/electron-builder/commit/78a65d2)), closes [#3371](https://github.com/electron-userland/electron-builder/issues/3371)
- better escaping of package-path arg ([44c8fd0](https://github.com/electron-userland/electron-builder/commit/44c8fd0))

## 3.1.1

### Bug Fixes

- url parameters, search is inside ([d553629](https://github.com/electron-userland/electron-builder/commit/d553629))
- partially restore sha256 support ([6f8e4ec](https://github.com/electron-userland/electron-builder/commit/6f8e4ec)), closes [#3137](https://github.com/electron-userland/electron-builder/issues/3137)
- unify "update-downloaded" event on macOS ([86d64c2](https://github.com/electron-userland/electron-builder/commit/86d64c2))

### Features

- download update on macOS in the same way as for other OS ([f966f1a](https://github.com/electron-userland/electron-builder/commit/f966f1a)), closes [#3168](https://github.com/electron-userland/electron-builder/issues/3168)

## 3.0.2

### Bug Fixes

- addRandomQueryToAvoidCaching does not respect query parameters

## 3.0.1

### Bug Fixes

- Replace all occurrences of version in old blockmap file url ([#3120](https://github.com/electron-userland/electron-builder/issues/3120)) ([ca18b74](https://github.com/electron-userland/electron-builder/commit/ca18b74))
- vertical upgrading for channels ([b1f2272](https://github.com/electron-userland/electron-builder/commit/b1f2272)), closes [#3111](https://github.com/electron-userland/electron-builder/issues/3111)

## 2.23.3

- fix case of blockmap file extension, detect s3 urls on setFeedURL ([369e9c0](https://github.com/electron-userland/electron-builder/commit/369e9c0))
- ignore unknown powershell errors ([a0026a7](https://github.com/electron-userland/electron-builder/commit/a0026a7)), closes [#2589](https://github.com/electron-userland/electron-builder/issues/2589)
- web installer differential download perMachine ([82708a5](https://github.com/electron-userland/electron-builder/commit/82708a5)), closes [#2949](https://github.com/electron-userland/electron-builder/issues/2949)

## 2.23.2

### Bug Fixes

- addRandomQueryToAvoidCaching breaks s3 provider for updater with private acl ([577b61b](https://github.com/electron-userland/electron-builder/commit/577b61b)), closes [#3021](https://github.com/electron-userland/electron-builder/issues/3021)

## 2.23.1

### Features

- [Delta updates for NSIS](https://github.com/electron-userland/electron-builder/releases/tag/v20.17.0) target ([7dd59fb](https://github.com/electron-userland/electron-builder/commit/7dd59fb)), closes [#2217](https://github.com/electron-userland/electron-builder/issues/2217) [#3042](https://github.com/electron-userland/electron-builder/issues/3042) [#3000](https://github.com/electron-userland/electron-builder/issues/3000) [#2977](https://github.com/electron-userland/electron-builder/issues/2977)
- support prereleases in a Github private repository ([59aac66](https://github.com/electron-userland/electron-builder/commit/59aac66)), closes [#3005](https://github.com/electron-userland/electron-builder/issues/3005) [#3037](https://github.com/electron-userland/electron-builder/issues/3037)
- cache downloaded update and reuse if valid later ([ba4809a](https://github.com/electron-userland/electron-builder/commit/ba4809a))
- electron-updater will update even I don't call quitAndInstall after app quit ([29f1c10](https://github.com/electron-userland/electron-builder/commit/29f1c10)), closes [#2493](https://github.com/electron-userland/electron-builder/issues/2493)

### Bug Fixes

- do not rename AppImage file if no version in the name ([48a0811](https://github.com/electron-userland/electron-builder/commit/48a0811)), closes [#2964](https://github.com/electron-userland/electron-builder/issues/2964)
- downloading builds(updates) more than once even if downloaded already ([6500b35](https://github.com/electron-userland/electron-builder/commit/6500b35)), closes [#3007](https://github.com/electron-userland/electron-builder/issues/3007) [#3003](https://github.com/electron-userland/electron-builder/issues/3003)
- set \_packageFile to null on clear ([7fe72da](https://github.com/electron-userland/electron-builder/commit/7fe72da))
- Prevent download notification queueing ([68804e4](https://github.com/electron-userland/electron-builder/commit/68804e4)), closes [#2850](https://github.com/electron-userland/electron-builder/issues/2850)
- add random query param to avoid caching ([254d7c5](https://github.com/electron-userland/electron-builder/commit/254d7c5)), closes [#2741](https://github.com/electron-userland/electron-builder/issues/2741)
- Close opened parenthese in update checking log ([8f19ea9](https://github.com/electron-userland/electron-builder/commit/8f19ea9)), closes [#2763](https://github.com/electron-userland/electron-builder/issues/2763)
- set actual http status code instead of 404 [#2741](https://github.com/electron-userland/electron-builder/issues/2741) ([8453a77](https://github.com/electron-userland/electron-builder/commit/8453a77))
- return correct release notes & name ([#2743](https://github.com/electron-userland/electron-builder/issues/2743)) ([37014be](https://github.com/electron-userland/electron-builder/commit/37014be)), closes [#2742](https://github.com/electron-userland/electron-builder/issues/2742)
- Allow --package-file arg to escape spaces in filenames ([#2739](https://github.com/electron-userland/electron-builder/issues/2739)) ([24a585b](https://github.com/electron-userland/electron-builder/commit/24a585b))
- Race condition during Application Quit ([#2746](https://github.com/electron-userland/electron-builder/issues/2746)) ([1df5d98](https://github.com/electron-userland/electron-builder/commit/1df5d98)), closes [#2745](https://github.com/electron-userland/electron-builder/issues/2745)
- use updateInfo.path as AppImage installer name ([#2722](https://github.com/electron-userland/electron-builder/issues/2722)) ([8233eae](https://github.com/electron-userland/electron-builder/commit/8233eae)), closes [#2672](https://github.com/electron-userland/electron-builder/issues/2672)
- add response code to error message about Accept-Ranges ([62cf1df](https://github.com/electron-userland/electron-builder/commit/62cf1df))
- Nsis app from fall 2017 (electron-updater 2.10.0) won't update to new version ([ba2957e](https://github.com/electron-userland/electron-builder/commit/ba2957e)), closes [#2583](https://github.com/electron-userland/electron-builder/issues/2583)
- recurrent 404 Errors on GitHub Enterprise ([afc1a9e](https://github.com/electron-userland/electron-builder/commit/afc1a9e))

## 2.19.0

## 2.19.0

### Features

- useMultipleRangeRequest option to disable using of multiple ranges request

## 2.18.2

### Bug Fixes

- AutoUpdate takes 60 seconds to fail validating signature on Windows 7 due to PowerShell version [#2421](https://github.com/electron-userland/electron-builder/issues/2421) ([da96e73](https://github.com/electron-userland/electron-builder/commit/da96e73))

## 2.18.1

### Bug Fixes

- add error codes ([2822049](https://github.com/electron-userland/electron-builder/commit/2822049)), closes [#2415](https://github.com/electron-userland/electron-builder/issues/2415)

## 2.18.0

### Bug Fixes

- redirect event in electron.net ([e2ac601](https://github.com/electron-userland/electron-builder/commit/e2ac601)), closes [#2374](https://github.com/electron-userland/electron-builder/issues/2374)
- use solid compression for web installer package ([6ea5668](https://github.com/electron-userland/electron-builder/commit/6ea5668))

## 2.17.2

### Bug Fixes

- Fix AppImage auto-update [#2240](https://github.com/electron-userland/electron-builder/issues/2240).

## 2.17.0

### Bug Fixes

- PrivateGitHubProvider requires at least Electron 1.6.11. Better to use latest stable.

### Features

- PrivateGitHubProvider [fixes](https://github.com/electron-userland/electron-builder/issues/2342).

## 2.16.2

### Features

- [Use the only HTTP request to download all changed blocks](https://github.com/electron-userland/electron-builder/releases/tag/v19.45.1).

## 2.16.0

### Features

- [Update metadata format allows several files](https://github.com/electron-userland/electron-builder/releases/tag/v19.44.0).

### Bug Fixes

- Include application name in update notification ([#2262](https://github.com/electron-userland/electron-builder/issues/2262)) ([1809c94](https://github.com/electron-userland/electron-builder/commit/1809c94))

## 2.13.0

### Features

- full changelog for all versions from current to latest ([67fe9ff](https://github.com/electron-userland/electron-builder/commit/67fe9ff))

## 2.12.1

### Performance Improvements

- a little bit more compact blockmap data ([c92bc38](https://github.com/electron-userland/electron-builder/commit/c92bc38))

## 2.12.0

### Features

- [Linux auto-update](https://github.com/electron-userland/electron-builder/releases/tag/v19.37.0)

## 2.11.0

### Features

- Differential updater: use [content defined chunking](https://github.com/electron-userland/electron-builder/releases/tag/v19.36.0)

## 2.10.2

### Bug Fixes

- Differential updater: fix "To download" in percentage value calculation (cosmetic fix)

## 2.10.1

### Bug Fixes

- PrivateGitHubProvider: clear error if no channel file in the latest github release

# 2.10.0 (2017-09-22)

### Features

- [DigitalOcean Spaces support](https://github.com/electron-userland/electron-builder/releases/tag/v19.30.0).

# 2.9.3 (2017-09-10)

### Features

- [Delta updates for Windows Web Installer](https://github.com/electron-userland/electron-builder/releases/tag/v19.28.4).

## 2.8.9 (2017-09-01)

### Bug Fixes

- Electron-updater does not support enterprise Github. [#1903](https://github.com/electron-userland/electron-builder/issues/1903).

## 2.8.8 (2017-09-01)

### Bug Fixes

- handle aborted event. [#1975](https://github.com/electron-userland/electron-builder/issues/1975).
