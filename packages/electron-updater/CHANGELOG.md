## 4.3.0

## 6.6.6

### Patch Changes

- [#9172](https://github.com/electron-userland/electron-builder/pull/9172) [`cb651ddb`](https://github.com/electron-userland/electron-builder/commit/cb651ddb732dd0b8614b1af25054261b978900dd) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat(updater): Cache the new blockmap file and allow customization of the old blockmap file base URL

## 6.6.5

### Patch Changes

- [#9113](https://github.com/electron-userland/electron-builder/pull/9113) [`8ba9be48`](https://github.com/electron-userland/electron-builder/commit/8ba9be481e3b777aa77884d265fd9b7f927a8a99) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: don't error out when trying to determine package manager

## 6.6.4

### Patch Changes

- [#9059](https://github.com/electron-userland/electron-builder/pull/9059) [`cb775088`](https://github.com/electron-userland/electron-builder/commit/cb775088427d25e9ce0489067445716d35e09997) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: support upgrading from ARM to ARM, rather than upgrading to x64 in window and linux

- [#9064](https://github.com/electron-userland/electron-builder/pull/9064) [`444b791f`](https://github.com/electron-userland/electron-builder/commit/444b791f9d2812f2a0f60481f7b25297585d9c5a) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: update regex for multipart content-type parsing in multipleRange

- [#9024](https://github.com/electron-userland/electron-builder/pull/9024) [`e641751c`](https://github.com/electron-userland/electron-builder/commit/e641751ce36cdf099d62a897c591b2763705dbff) Thanks [@Lemonexe](https://github.com/Lemonexe)! - fix: allow forceDevUpdateConfig also on Linux

## 6.6.3

### Patch Changes

- [#9021](https://github.com/electron-userland/electron-builder/pull/9021) [`cf43f056`](https://github.com/electron-userland/electron-builder/commit/cf43f0567c6addaf3cefd7eadada95bd543165e1) Thanks [@Lemonexe](https://github.com/Lemonexe)! - feat: allow overriding AppUpdater.isStagingMatch

- [#8992](https://github.com/electron-userland/electron-builder/pull/8992) [`1f505400`](https://github.com/electron-userland/electron-builder/commit/1f5054004468f76d316cee33ef6cc8717987b146) Thanks [@Sytten](https://github.com/Sytten)! - Fixed missing lowercase in extension comparison.

- Updated dependencies [[`a2f7f735`](https://github.com/electron-userland/electron-builder/commit/a2f7f7350be2379c4917417c92ece5a6ab241708)]:
  - builder-util-runtime@9.3.2

## 6.6.2

### Patch Changes

- [#8933](https://github.com/electron-userland/electron-builder/pull/8933) [`324032c5`](https://github.com/electron-userland/electron-builder/commit/324032c5ea94b983cda8a5510fcc1a3fb752a1a1) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: re-export `CancellationToken`, `PackageFileInfo`, `ProgressInfo`, `UpdateFileInfo`, `UpdateInfo` from electron-updater

## 6.6.1

### Patch Changes

- [#8913](https://github.com/electron-userland/electron-builder/pull/8913) [`065c6a45`](https://github.com/electron-userland/electron-builder/commit/065c6a456e34e7f8c13cba483d433502b9325168) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(refactor): refactoring code to reduce cyclical imports in order to migrate to rollup + vite (which have much more strict module resolutions)

## 6.6.0

### Minor Changes

- [#8817](https://github.com/electron-userland/electron-builder/pull/8817) [`ea3e0f5f`](https://github.com/electron-userland/electron-builder/commit/ea3e0f5ff8ac9a5e01bcd11585d9f5e6a57b076e) Thanks [@Akatroj](https://github.com/Akatroj)! - fix: Dispatch error in updater if `spawnSyncLog` fails

## 6.5.0

### Minor Changes

- [#8829](https://github.com/electron-userland/electron-builder/pull/8829) [`14ee2d6b`](https://github.com/electron-userland/electron-builder/commit/14ee2d6be32fd6e9165381e0709e5a2e8049ece2) Thanks [@Julusian](https://github.com/Julusian)! - feat: add `isUpdateAvailable` property to `checkForUpdates` result

- [#8692](https://github.com/electron-userland/electron-builder/pull/8692) [`96c5d140`](https://github.com/electron-userland/electron-builder/commit/96c5d14027d56473ae5dd843c023709a01782963) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: add support for custom `isUpdateSupported` hook for validating `UpdateInfo`, with fallback to previous `minimumSystemVersion` logic

## 6.4.1

### Patch Changes

- Updated dependencies [[`8e7811d1`](https://github.com/electron-userland/electron-builder/commit/8e7811d18de3acb39ce9253cf2cd9afa4e23f99c), [`07429661`](https://github.com/electron-userland/electron-builder/commit/07429661c0da2248cec5b92eb03390ae19266328)]:
  - builder-util-runtime@9.3.1

## 6.4.0

### Minor Changes

- [#8711](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af) Thanks [@hrueger](https://github.com/hrueger)! - Add `host` property to support self-hosted Keygen instances

- [#8633](https://github.com/electron-userland/electron-builder/pull/8633) [`96f5c3eb`](https://github.com/electron-userland/electron-builder/commit/96f5c3ebbd6b3b58c9c5d3e777577d49edcb6e5a) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(updater): allow usage of `autoRunAppAfterInstall` on mac updater

- [#8394](https://github.com/electron-userland/electron-builder/pull/8394) [`ae9221d9`](https://github.com/electron-userland/electron-builder/commit/ae9221d947c2dedff7b655ddafceb9746f9f4460) Thanks [@xyloflake](https://github.com/xyloflake)! - feat: Implement autoupdates for pacman

### Patch Changes

- [#8802](https://github.com/electron-userland/electron-builder/pull/8802) [`4a68fd2d`](https://github.com/electron-userland/electron-builder/commit/4a68fd2d3d529b0f854877a5415f9ccad00b61fd) Thanks [@erijo](https://github.com/erijo)! - fix(linux): AppImage update fails when filename contains spaces

- [#8623](https://github.com/electron-userland/electron-builder/pull/8623) [`cfa67c01`](https://github.com/electron-userland/electron-builder/commit/cfa67c01827a44c88fb8448562dbe928ba37494f) Thanks [@DamonYu6](https://github.com/DamonYu6)! - fix: copyFileSync operation will block the main thread

- [#8695](https://github.com/electron-userland/electron-builder/pull/8695) [`819eff7b`](https://github.com/electron-userland/electron-builder/commit/819eff7bf7f319275d70faf3a64a5a18a3793a7c) Thanks [@peter-sanderson](https://github.com/peter-sanderson)! - fix: respect `disableDifferentialDownload` flag for AppImage

- Updated dependencies [[`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1), [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)]:
  - builder-util-runtime@9.3.0

## 6.4.0-alpha.4

### Patch Changes

- [#8802](https://github.com/electron-userland/electron-builder/pull/8802) [`4a68fd2d`](https://github.com/electron-userland/electron-builder/commit/4a68fd2d3d529b0f854877a5415f9ccad00b61fd) Thanks [@erijo](https://github.com/erijo)! - fix(linux): AppImage update fails when filename contains spaces

## 6.4.0-alpha.3

### Patch Changes

- [#8695](https://github.com/electron-userland/electron-builder/pull/8695) [`819eff7b`](https://github.com/electron-userland/electron-builder/commit/819eff7bf7f319275d70faf3a64a5a18a3793a7c) Thanks [@peter-sanderson](https://github.com/peter-sanderson)! - fix: respect `disableDifferentialDownload` flag for AppImage

## 6.4.0-alpha.2

### Minor Changes

- [#8711](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af) Thanks [@hrueger](https://github.com/hrueger)! - Add `host` property to support self-hosted Keygen instances

### Patch Changes

- Updated dependencies [[`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1), [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)]:
  - builder-util-runtime@9.3.0-alpha.0

## 6.4.0-alpha.1

### Minor Changes

- [#8633](https://github.com/electron-userland/electron-builder/pull/8633) [`96f5c3eb`](https://github.com/electron-userland/electron-builder/commit/96f5c3ebbd6b3b58c9c5d3e777577d49edcb6e5a) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(updater): allow usage of `autoRunAppAfterInstall` on mac updater

### Patch Changes

- [#8623](https://github.com/electron-userland/electron-builder/pull/8623) [`cfa67c01`](https://github.com/electron-userland/electron-builder/commit/cfa67c01827a44c88fb8448562dbe928ba37494f) Thanks [@q837477816](https://github.com/q837477816)! - fix: copyFileSync operation will block the main thread

## 6.4.0-alpha.0

### Minor Changes

- [#8394](https://github.com/electron-userland/electron-builder/pull/8394) [`ae9221d9`](https://github.com/electron-userland/electron-builder/commit/ae9221d947c2dedff7b655ddafceb9746f9f4460) Thanks [@xyloflake](https://github.com/xyloflake)! - feat: Implement autoupdates for pacman

## 6.3.9

### Patch Changes

- [#8541](https://github.com/electron-userland/electron-builder/pull/8541) [`b6d6ea993fd3b368d28786c259bb50486aaac417`](https://github.com/electron-userland/electron-builder/commit/b6d6ea993fd3b368d28786c259bb50486aaac417) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: Unable to copy file for caching: ENOENT

- [#8545](https://github.com/electron-userland/electron-builder/pull/8545) [`fc3a78e4e61f916058fca9b15fc16f076c3fabd1`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update devDependencies, including typescript

- Updated dependencies [[`fc3a78e4e61f916058fca9b15fc16f076c3fabd1`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1)]:
  - builder-util-runtime@9.2.10

## 6.3.8

### Patch Changes

- [#8516](https://github.com/electron-userland/electron-builder/pull/8516) [`d1cb6bdb`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(chore): upgrading typescript and fixing compiler errors

- Updated dependencies [[`d1cb6bdb`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338)]:
  - builder-util-runtime@9.2.9

## 6.3.7

### Patch Changes

- [#8491](https://github.com/electron-userland/electron-builder/pull/8491) [`178a3c40`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: migrating to typedoc and updating/improving type+interface definitions

- Updated dependencies [[`178a3c40`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4)]:
  - builder-util-runtime@9.2.8

## 6.3.6

### Patch Changes

- [#8486](https://github.com/electron-userland/electron-builder/pull/8486) [`d56cd274`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deploy): redeploy all packages to sync semver ranges

- Updated dependencies [[`d56cd274`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744)]:
  - builder-util-runtime@9.2.7

## 6.3.5

### Patch Changes

- [#8437](https://github.com/electron-userland/electron-builder/pull/8437) [`be625e06`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151) Thanks [@juwonjung-hdj](https://github.com/juwonjung-hdj)! - fix: retry renaming update file when EBUSY error occurs due to file lock

- Updated dependencies [[`be625e06`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151)]:
  - builder-util-runtime@9.2.6

## 6.3.4

### Patch Changes

- [#8417](https://github.com/electron-userland/electron-builder/pull/8417) [`e77de9f6`](https://github.com/electron-userland/electron-builder/commit/e77de9f66184b0cfdab6f1aa9a9c95b041d99c84) Thanks [@beyondkmp](https://github.com/beyondkmp)! - update semver to latest

- [#8409](https://github.com/electron-userland/electron-builder/pull/8409) [`5fae1cf3`](https://github.com/electron-userland/electron-builder/commit/5fae1cf3be0388c2bd95a341a0340faa839d2aa7) Thanks [@ckarich](https://github.com/ckarich)! - fix: windows signature verification special chars

- [#8282](https://github.com/electron-userland/electron-builder/pull/8282) [`15ce5b41`](https://github.com/electron-userland/electron-builder/commit/15ce5b4164378f7398ff84cabe8ee97eef5cfd1b) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix aborted event

## 6.3.3

### Patch Changes

- [#8400](https://github.com/electron-userland/electron-builder/pull/8400) [`9dc0b49a`](https://github.com/electron-userland/electron-builder/commit/9dc0b49aea1d3bb56b42c3b1bdb6001708a34439) Thanks [@Ryan432](https://github.com/Ryan432)! - fix: Handle Linux deb auto update installation on applications having spaces in `artifactName`.

- [#8393](https://github.com/electron-userland/electron-builder/pull/8393) [`8dabf64b`](https://github.com/electron-userland/electron-builder/commit/8dabf64b8f84975cf4eb016dcd23411ab0d4bf64) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: allow custom channel in github provider

- [#8403](https://github.com/electron-userland/electron-builder/pull/8403) [`1c14820b`](https://github.com/electron-userland/electron-builder/commit/1c14820b97fad802b300dd93ccd4d6a10a72360f) Thanks [@xyloflake](https://github.com/xyloflake)! - fix: handle spaces for all linux package managers

## 6.3.2

### Patch Changes

- [#8378](https://github.com/electron-userland/electron-builder/pull/8378) [`c8fe1462`](https://github.com/electron-userland/electron-builder/commit/c8fe1462d529edeed0ad3fe0b7e99e8af1ca61ac) Thanks [@s77rt](https://github.com/s77rt)! - Limit concurrent downloads to 1

## 6.3.1

### Patch Changes

- [#8372](https://github.com/electron-userland/electron-builder/pull/8372) [`c85b73d7`](https://github.com/electron-userland/electron-builder/commit/c85b73d7c8dcefe86b0b350946af1cea951e6aae) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: allow enabling tsc lib checking on electron-updater package

## 6.3.0

### Minor Changes

- [#8095](https://github.com/electron-userland/electron-builder/pull/8095) [`53cec79b`](https://github.com/electron-userland/electron-builder/commit/53cec79bdc3f56c9371bdfb7901e97650d9ac4bc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: adding differential downloader for updates on macOS

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8323](https://github.com/electron-userland/electron-builder/pull/8323) [`fa3275c0`](https://github.com/electron-userland/electron-builder/commit/fa3275c05b334f59453d04551fffa24bfa558e48) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency typescript to v5.5.3

- [#8135](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: unstable hdiutil retry mechanism

- [#8295](https://github.com/electron-userland/electron-builder/pull/8295) [`ac2e6a25`](https://github.com/electron-userland/electron-builder/commit/ac2e6a25aa491c1ef5167a552c19fc2085cd427f) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: verify LiteralPath of update file during windows signature verification

- [#8311](https://github.com/electron-userland/electron-builder/pull/8311) [`35a0784e`](https://github.com/electron-userland/electron-builder/commit/35a0784eb4cffc2fcbf33ec58fefbacf8e8e5125) Thanks [@rastiqdev](https://github.com/rastiqdev)! - fix(rpm-updater): stop uninstalling app before update

- [#8227](https://github.com/electron-userland/electron-builder/pull/8227) [`48c59535`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993) Thanks [@rotu](https://github.com/rotu)! - fix(docs): update autoupdate docs noting that channels work with Github

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

- Updated dependencies [[`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf), [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28), [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48), [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41), [`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89), [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)]:
  - builder-util-runtime@9.2.5

## 6.3.0-alpha.8

### Patch Changes

- [#8323](https://github.com/electron-userland/electron-builder/pull/8323) [`fa3275c0`](https://github.com/electron-userland/electron-builder/commit/fa3275c05b334f59453d04551fffa24bfa558e48) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency typescript to v5.5.3

- [#8311](https://github.com/electron-userland/electron-builder/pull/8311) [`35a0784e`](https://github.com/electron-userland/electron-builder/commit/35a0784eb4cffc2fcbf33ec58fefbacf8e8e5125) Thanks [@rastiqdev](https://github.com/rastiqdev)! - fix(rpm-updater): stop uninstalling app before update

## 6.3.0-alpha.7

### Patch Changes

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- Updated dependencies [[`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28), [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48)]:
  - builder-util-runtime@9.2.5-alpha.4

## 6.3.0-alpha.6

### Patch Changes

- [#8295](https://github.com/electron-userland/electron-builder/pull/8295) [`ac2e6a25`](https://github.com/electron-userland/electron-builder/commit/ac2e6a25aa491c1ef5167a552c19fc2085cd427f) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: verify LiteralPath of update file during windows signature verification

## 6.3.0-alpha.5

### Patch Changes

- Updated dependencies [[`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89)]:
  - builder-util-runtime@9.2.5-alpha.3

## 6.3.0-alpha.4

### Patch Changes

- [#8227](https://github.com/electron-userland/electron-builder/pull/8227) [`48c59535`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993) Thanks [@rotu](https://github.com/rotu)! - fix(docs): update autoupdate docs noting that channels work with Github

## 6.3.0-alpha.3

### Patch Changes

- [#8135](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: unstable hdiutil retry mechanism

## 6.3.0-alpha.2

### Patch Changes

- Updated dependencies [[`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41)]:
  - builder-util-runtime@9.2.5-alpha.2

## 6.3.0-alpha.1

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

- Updated dependencies [[`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf)]:
  - builder-util-runtime@9.2.5-alpha.1

## 6.3.0-alpha.0

### Minor Changes

- [#8095](https://github.com/electron-userland/electron-builder/pull/8095) [`53cec79b`](https://github.com/electron-userland/electron-builder/commit/53cec79bdc3f56c9371bdfb7901e97650d9ac4bc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: adding differential downloader for updates on macOS

### Patch Changes

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

- Updated dependencies [[`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)]:
  - builder-util-runtime@9.2.5-alpha.0

## 6.2.1

### Patch Changes

- [#8091](https://github.com/electron-userland/electron-builder/pull/8091) [`e2a181d9`](https://github.com/electron-userland/electron-builder/commit/e2a181d9fe3fbdd84690359e275daaef24584729) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(mac): revert autoupdate for mac differential

## 6.2.0

### Minor Changes

- [#7709](https://github.com/electron-userland/electron-builder/pull/7709) [`79df5423`](https://github.com/electron-userland/electron-builder/commit/79df54238621fbe48ba20444129950ba2dc49983) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: adding differential downloader for updates on macOS

## 6.1.9

### Patch Changes

- [#8051](https://github.com/electron-userland/electron-builder/pull/8051) [`48603ba0`](https://github.com/electron-userland/electron-builder/commit/48603ba09dc7103849a2975799c19068fd08fc07) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: auto-update powershell script requires reset of `PSModulePath`

- [#8057](https://github.com/electron-userland/electron-builder/pull/8057) [`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: upgrading connected dependencies (typescript requires higher eslint version)

- Updated dependencies [[`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e)]:
  - builder-util-runtime@9.2.4

## 6.1.8

### Patch Changes

- [#7950](https://github.com/electron-userland/electron-builder/pull/7950) [`03c94516`](https://github.com/electron-userland/electron-builder/commit/03c94516ef3b1b31b2f5b7bcdb9c6d3753d36b8d) Thanks [@bronsonmock](https://github.com/bronsonmock)! - feat(nsis): add option to disable differential download

## 6.1.7

### Patch Changes

- Updated dependencies [[`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f), [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f)]:
  - builder-util-runtime@9.2.3

## 6.1.6

### Patch Changes

- Updated dependencies [[`549d07b0`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a)]:
  - builder-util-runtime@9.2.2

## 6.1.5

### Patch Changes

- [#7767](https://github.com/electron-userland/electron-builder/pull/7767) [`21f3069c`](https://github.com/electron-userland/electron-builder/commit/21f3069cb6dcad30959af4bfd8f3014133a3dfde) Thanks [@jackple](https://github.com/jackple)! - fix: When error code is ENOENT, try to use electron.shell.openPath to run installer on Windows

## 6.1.4

### Patch Changes

- [#7666](https://github.com/electron-userland/electron-builder/pull/7666) [`441da40d`](https://github.com/electron-userland/electron-builder/commit/441da40d814d90154ed9b120684e7c1a7d919c52) Thanks [@sethjray](https://github.com/sethjray)! - fix: check null for `isCustomChannel` in GitHubProvider.ts

## 6.1.3

### Patch Changes

- [#7637](https://github.com/electron-userland/electron-builder/pull/7637) [`b3dfe64b`](https://github.com/electron-userland/electron-builder/commit/b3dfe64b22dc51375861f6b8a3517ff9ab562aaf) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: trigger `app.relaunch()` if `isForceRunAfter = true` for (beta) deb and rpm updaters

- [#7633](https://github.com/electron-userland/electron-builder/pull/7633) [`531a6309`](https://github.com/electron-userland/electron-builder/commit/531a6309283ea1b2b262817a170e2c030735f8b6) Thanks [@s00d](https://github.com/s00d)! - fix: change typed-emitter to tiny-typed-emitter to remove rxjs dependency

## 6.1.2

### Patch Changes

- [#7628](https://github.com/electron-userland/electron-builder/pull/7628) [`98f535e1`](https://github.com/electron-userland/electron-builder/commit/98f535e1f80b7f84dc3c2f135a4a5ea8cd142f31) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: removing stdio from spawnSync to fix crash on rpm/deb updaters

## 6.1.1

### Patch Changes

- [#7597](https://github.com/electron-userland/electron-builder/pull/7597) [`cd15e161`](https://github.com/electron-userland/electron-builder/commit/cd15e161031e180200ab772f01198a5b68fa42fe) Thanks [@marcuskirsch](https://github.com/marcuskirsch)! - fix: default file name of `update.${fileExtension}` for downloaded files in private repositories.

## 6.1.0

### Minor Changes

- [#7533](https://github.com/electron-userland/electron-builder/pull/7533) [`4786d415`](https://github.com/electron-userland/electron-builder/commit/4786d41575c638137c7016c905d089ab74bf5e28) Thanks [@vitto-moz](https://github.com/vitto-moz)! - feat: nsis install method - exposed as public to avoid quit the app for the install

### Patch Changes

- [#7544](https://github.com/electron-userland/electron-builder/pull/7544) [`dab3aeba`](https://github.com/electron-userland/electron-builder/commit/dab3aeba2240ead4300c8fdb35e3d9c16b04a23d) Thanks [@NoahAndrews](https://github.com/NoahAndrews)! - Fix differential downloads when the server compresses the blockmap file HTTP response

- Updated dependencies [[`dab3aeba`](https://github.com/electron-userland/electron-builder/commit/dab3aeba2240ead4300c8fdb35e3d9c16b04a23d)]:
  - builder-util-runtime@9.2.1

## 6.0.4

### Patch Changes

- [#7542](https://github.com/electron-userland/electron-builder/pull/7542) [`9123e31e`](https://github.com/electron-userland/electron-builder/commit/9123e31eb792211da717804e5a5b8029fe694d5f) Thanks [@ganthern](https://github.com/ganthern)! - fix: handle errors on responses in differential download (#2398)

## 6.0.3

### Patch Changes

- [#7524](https://github.com/electron-userland/electron-builder/pull/7524) [`1a134800`](https://github.com/electron-userland/electron-builder/commit/1a13480036a2219007f866c64beea45292bc2946) Thanks [@NoahAndrews](https://github.com/NoahAndrews)! - Fixed error handling when launching updater (fixes NSIS updates when isAdminRightsRequired is incorrectly set to false)

## 6.0.2

### Patch Changes

- [#7508](https://github.com/electron-userland/electron-builder/pull/7508) [`d4c90b67`](https://github.com/electron-userland/electron-builder/commit/d4c90b676aa22c745de4129f98453b97f264805c) Thanks [@NoahAndrews](https://github.com/NoahAndrews)! - Removed DefinitelyTyped dependencies from production dependencies list

## 6.0.1

### Patch Changes

- [#7503](https://github.com/electron-userland/electron-builder/pull/7503) [`a2ab1ff3`](https://github.com/electron-userland/electron-builder/commit/a2ab1ff36dbe99a9c9d22bde15e83482eb5be340) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: NsisUpdater - only resolving true if pid !== undefined

## 6.0.0

### Major Changes

- [#7032](https://github.com/electron-userland/electron-builder/pull/7032) [`caa32e07`](https://github.com/electron-userland/electron-builder/commit/caa32e0708ba4347dd37e93174fce1d2c5660160) Thanks [@kidonng](https://github.com/kidonng)! - fix: use appropriate `electron-updater` cache directory on macOS

### Minor Changes

- [#7060](https://github.com/electron-userland/electron-builder/pull/7060) [`1d130012`](https://github.com/electron-userland/electron-builder/commit/1d130012737e77b57c8923fcc0e6ad2cbc5da0e8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Introducing deb and rpm auto-updates as beta feature

- [#7337](https://github.com/electron-userland/electron-builder/pull/7337) [`9c0c4228`](https://github.com/electron-userland/electron-builder/commit/9c0c422834369f42b311b5d9ecd301f8b50bccfa) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: Provide a custom verify function interface to enable nsis signature verification alternatives instead of powershell

### Patch Changes

- [#7380](https://github.com/electron-userland/electron-builder/pull/7380) [`7862e388`](https://github.com/electron-userland/electron-builder/commit/7862e388a2049ccbe1e01a5624c6a8a5f2942d54) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: add reject in handleError in Windows `verifySignature` function

- [#7230](https://github.com/electron-userland/electron-builder/pull/7230) [`346af1d4`](https://github.com/electron-userland/electron-builder/commit/346af1d470ebbf12733a9619a2389bcfdf452bc6) Thanks [@jeremyspiegel](https://github.com/jeremyspiegel)! - fix: support powershell constrained language mode

- [#7394](https://github.com/electron-userland/electron-builder/pull/7394) [`1bbcfb3d`](https://github.com/electron-userland/electron-builder/commit/1bbcfb3dc5f36b0803c69e9170db16ded52a0043) Thanks [@ganthern](https://github.com/ganthern)! - fix: inherit stdio for updated processes (#7393)

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- [#7213](https://github.com/electron-userland/electron-builder/pull/7213) [`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides

- Updated dependencies [[`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa), [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98), [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577), [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)]:
  - builder-util-runtime@9.2.0

## 6.0.0-alpha.9

### Patch Changes

- [#7394](https://github.com/electron-userland/electron-builder/pull/7394) [`1bbcfb3d`](https://github.com/electron-userland/electron-builder/commit/1bbcfb3dc5f36b0803c69e9170db16ded52a0043) Thanks [@ganthern](https://github.com/ganthern)! - fix: inherit stdio for updated processes (#7393)

## 6.0.0-alpha.8

### Patch Changes

- [#7380](https://github.com/electron-userland/electron-builder/pull/7380) [`7862e388`](https://github.com/electron-userland/electron-builder/commit/7862e388a2049ccbe1e01a5624c6a8a5f2942d54) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: add reject in handleError in Windows `verifySignature` function

- Updated dependencies [[`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98)]:
  - builder-util-runtime@9.2.0-alpha.3

## 6.0.0-alpha.7

### Minor Changes

- [#7337](https://github.com/electron-userland/electron-builder/pull/7337) [`9c0c4228`](https://github.com/electron-userland/electron-builder/commit/9c0c422834369f42b311b5d9ecd301f8b50bccfa) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: Provide a custom verify function interface to enable nsis signature verification alternatives instead of powershell

## 6.0.0-alpha.6

### Patch Changes

- Updated dependencies [[`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa)]:
  - builder-util-runtime@9.2.0-alpha.2

## 6.0.0-alpha.5

### Patch Changes

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- Updated dependencies [[`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577)]:
  - builder-util-runtime@9.1.2-alpha.1

## 6.0.0-alpha.4

### Minor Changes

- [#7060](https://github.com/electron-userland/electron-builder/pull/7060) [`1d130012`](https://github.com/electron-userland/electron-builder/commit/1d130012737e77b57c8923fcc0e6ad2cbc5da0e8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Introducing deb and rpm auto-updates as beta feature

## 6.0.0-alpha.3

### Patch Changes

- [#7230](https://github.com/electron-userland/electron-builder/pull/7230) [`346af1d4`](https://github.com/electron-userland/electron-builder/commit/346af1d470ebbf12733a9619a2389bcfdf452bc6) Thanks [@jeremyspiegel](https://github.com/jeremyspiegel)! - fix: support powershell constrained language mode

## 6.0.0-alpha.2

### Patch Changes

- [#7213](https://github.com/electron-userland/electron-builder/pull/7213) [`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides

## 6.0.0-alpha.1

### Patch Changes

- Updated dependencies [[`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)]:
  - builder-util-runtime@9.1.2-alpha.0

## 6.0.0-alpha.0

### Major Changes

- [#7032](https://github.com/electron-userland/electron-builder/pull/7032) [`caa32e07`](https://github.com/electron-userland/electron-builder/commit/caa32e0708ba4347dd37e93174fce1d2c5660160) Thanks [@kidonng](https://github.com/kidonng)! - fix: use appropriate `electron-updater` cache directory on macOS

## 5.3.0

### Minor Changes

- [#7136](https://github.com/electron-userland/electron-builder/pull/7136) [`4d989a8a`](https://github.com/electron-userland/electron-builder/commit/4d989a8a52bf7baac22742769abcc795ce193fbd) Thanks [@shenglianlee](https://github.com/shenglianlee)! - feat: non-silent mode allow not to run the app when the installation is complete

## 5.2.4

### Patch Changes

- [#7117](https://github.com/electron-userland/electron-builder/pull/7117) [`0c528411`](https://github.com/electron-userland/electron-builder/commit/0c528411fb8a7de23e974f44e36c5e69bd3bb167) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: allow dev update config to be forced for testing auto-updater flow

## 5.2.3

### Patch Changes

- [#7099](https://github.com/electron-userland/electron-builder/pull/7099) [`cd21b091`](https://github.com/electron-userland/electron-builder/commit/cd21b0918843fe1269ddaf8dde099c8faeb54b80) Thanks [@alefoll](https://github.com/alefoll)! - fix(docs): improve `downloadUpdate` typing to match the doc

- Updated dependencies [[`1023a93e`](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18)]:
  - builder-util-runtime@9.1.1

## 5.2.2

### Patch Changes

- Updated dependencies [[`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a)]:
  - builder-util-runtime@9.1.0

## 5.2.1

### Patch Changes

- [#6998](https://github.com/electron-userland/electron-builder/pull/6998) [`d6115bc5`](https://github.com/electron-userland/electron-builder/commit/d6115bc5d066d6eee2638015be0c804b31ffcc18) Thanks [@matejkriz](https://github.com/matejkriz)! - fix(electron-updater): fix backward compatibility for GitHub provider without channels

* [#6995](https://github.com/electron-userland/electron-builder/pull/6995) [`c9f0da51`](https://github.com/electron-userland/electron-builder/commit/c9f0da51cab25a60d4adea94f8c8e7e05362b0ca) Thanks [@panther7](https://github.com/panther7)! - Fix installDir definition #6907

## 5.2.0

### Minor Changes

- [#6907](https://github.com/electron-userland/electron-builder/pull/6907) [`e7f28677`](https://github.com/electron-userland/electron-builder/commit/e7f286776643823f9c906738aade1d71eb1bdd9c) Thanks [@panther7](https://github.com/panther7)! - Add installDir property for NsisUpdater. Now is it posible change install folder from AppUpdater.

## 5.1.0

### Minor Changes

- [#6941](https://github.com/electron-userland/electron-builder/pull/6941) [`14503ceb`](https://github.com/electron-userland/electron-builder/commit/14503ceb99c1a31c54a261a1ae60a34980f36a50) Thanks [@ezekg](https://github.com/ezekg)! - Upgrade Keygen publisher/updater integration to API version v1.1.

### Patch Changes

- [#6975](https://github.com/electron-userland/electron-builder/pull/6975) [`8279d053`](https://github.com/electron-userland/electron-builder/commit/8279d053d520e7506d84bf9710972b998e70b752) Thanks [@ezekg](https://github.com/ezekg)! - Fix artifact conflicts for Keygen provider when multiple artifacts share the same filename across products.

- Updated dependencies [[`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb)]:
  - builder-util-runtime@9.0.3

## 5.0.6

### Patch Changes

- [#6909](https://github.com/electron-userland/electron-builder/pull/6909) [`0b6db59e`](https://github.com/electron-userland/electron-builder/commit/0b6db59ec10dfe05903f29d6790972f55746bef7) Thanks [@ezekg](https://github.com/ezekg)! - Pin Keygen publisher/updater integration to API version v1.0.

## 5.0.5

### Patch Changes

- [#6889](https://github.com/electron-userland/electron-builder/pull/6889) [`869ec27f`](https://github.com/electron-userland/electron-builder/commit/869ec27fd1d99b9913875cb4d7ae7c733c1f3e25) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: moving typed-emitter from devDependency to dependencies

## 5.0.4

### Patch Changes

- [#6822](https://github.com/electron-userland/electron-builder/pull/6822) [`bfe29a5e`](https://github.com/electron-userland/electron-builder/commit/bfe29a5e991c2719032877bd7225b15b6b836221) Thanks [@RoikkuTo](https://github.com/RoikkuTo)! - fix: Unable to find latest version on GitHub

* [#6825](https://github.com/electron-userland/electron-builder/pull/6825) [`db075480`](https://github.com/electron-userland/electron-builder/commit/db0754805b4d6c5d8a4d86af7cb107db87bda303) Thanks [@Nokel81](https://github.com/Nokel81)! - Added types for AppUpdater's events

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
