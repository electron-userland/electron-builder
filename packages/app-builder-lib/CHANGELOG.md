# app-builder-lib

## 25.0.4

### Patch Changes

- [#8392](https://github.com/electron-userland/electron-builder/pull/8392) [`12c52a81`](https://github.com/electron-userland/electron-builder/commit/12c52a81420f04ec0e205dd83798c2b0b773011d) Thanks [@beyondkmp](https://github.com/beyondkmp)! - Automatically place .node files into app.asar.unpack

- [#8398](https://github.com/electron-userland/electron-builder/pull/8398) [`5ab2bee1`](https://github.com/electron-userland/electron-builder/commit/5ab2bee1e1db77967c65d56443f0dc79de5071da) Thanks [@beyondkmp](https://github.com/beyondkmp)! - add disableDefaultIgnoredFiles option

- Updated dependencies []:
  - dmg-builder@25.0.4
  - electron-builder-squirrel-windows@25.0.4

## 25.0.3

### Patch Changes

- [#8384](https://github.com/electron-userland/electron-builder/pull/8384) [`f8fbdd12`](https://github.com/electron-userland/electron-builder/commit/f8fbdd122ecdc7a967f3fbeef3572dfd133cc5e3) Thanks [@BlackHole1](https://github.com/BlackHole1)! - Fix the issue of being unable to sign binary files in the Windows runner on Github Actions

- [#8371](https://github.com/electron-userland/electron-builder/pull/8371) [`afd81326`](https://github.com/electron-userland/electron-builder/commit/afd813265d346b7bddba7ea63563c876f630088e) Thanks [@beyondkmp](https://github.com/beyondkmp)! - delete the symlink file when the target is empty

- Updated dependencies [[`553c737b`](https://github.com/electron-userland/electron-builder/commit/553c737b2cf1ad835690f7db3c1907ae88944d15)]:
  - builder-util@25.0.3
  - dmg-builder@25.0.3
  - electron-builder-squirrel-windows@25.0.3
  - electron-publish@25.0.3

## 25.0.2

### Patch Changes

- [#8356](https://github.com/electron-userland/electron-builder/pull/8356) [`2541eb62`](https://github.com/electron-userland/electron-builder/commit/2541eb62a6a8338c87f3d032ff48ed154c2d3cca) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: adding additional logging when importing/requiring a module in case the hook script is invalid or unable to be executed

- [#8368](https://github.com/electron-userland/electron-builder/pull/8368) [`2acdf65d`](https://github.com/electron-userland/electron-builder/commit/2acdf65d47ad4b8fb546a00833d646a5e58e5428) Thanks [@pimterry](https://github.com/pimterry)! - fix: don't setuid chrome-sandbox when not required

- [#8372](https://github.com/electron-userland/electron-builder/pull/8372) [`c85b73d7`](https://github.com/electron-userland/electron-builder/commit/c85b73d7c8dcefe86b0b350946af1cea951e6aae) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: allow enabling tsc lib checking on electron-updater package

- [#8375](https://github.com/electron-userland/electron-builder/pull/8375) [`54c1059b`](https://github.com/electron-userland/electron-builder/commit/54c1059b961f7c2a493d26b7e6ef674911069cad) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: checking cancellation token during pack and any retry tasks to exit early on process "cancel"

- [#8364](https://github.com/electron-userland/electron-builder/pull/8364) [`2a0ea65c`](https://github.com/electron-userland/electron-builder/commit/2a0ea65caad1067a193b72d684e7c1f95cdecce5) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update babel monorepo

- Updated dependencies [[`54c1059b`](https://github.com/electron-userland/electron-builder/commit/54c1059b961f7c2a493d26b7e6ef674911069cad)]:
  - builder-util@25.0.2
  - dmg-builder@25.0.2
  - electron-builder-squirrel-windows@25.0.2
  - electron-publish@25.0.2

## 25.0.1

### Patch Changes

- [#8352](https://github.com/electron-userland/electron-builder/pull/8352) [`372b046b`](https://github.com/electron-userland/electron-builder/commit/372b046bec23ba0390a6cdb3b4390f033796c833) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(mac): `disablePreGypCopy: true` to handle mac universal builds (fixes #8347)

- [#8341](https://github.com/electron-userland/electron-builder/pull/8341) [`578a7e1a`](https://github.com/electron-userland/electron-builder/commit/578a7e1a0fcf2a700fe5fadcb1567c1193bd978d) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deps): update dependency @electron/osx-sign to v1.3.1

- Updated dependencies [[`089dd639`](https://github.com/electron-userland/electron-builder/commit/089dd6396c9638910967c1968d9b8056acd952a9)]:
  - builder-util@25.0.1
  - dmg-builder@25.0.1
  - electron-builder-squirrel-windows@25.0.1
  - electron-publish@25.0.1

## 25.0.0

### Minor Changes

- [#8190](https://github.com/electron-userland/electron-builder/pull/8190) [`503da26f`](https://github.com/electron-userland/electron-builder/commit/503da26f1ef71bff19bd173bdce4052c48ddc5cc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: update app-builder-bin to 5.0-alpha release

- [#8123](https://github.com/electron-userland/electron-builder/pull/8123) [`031d7d5b`](https://github.com/electron-userland/electron-builder/commit/031d7d5bdf911cb6dc4b0b108f82df44f4c2b224) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add disableSanityCheckAsar to allow encrypted asars

- [#8150](https://github.com/electron-userland/electron-builder/pull/8150) [`f4e6ae29`](https://github.com/electron-userland/electron-builder/commit/f4e6ae2931cbf79670b5f2c252a91bed03d96546) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: add functionality to just publish artifacts

- [#8218](https://github.com/electron-userland/electron-builder/pull/8218) [`22737b2b`](https://github.com/electron-userland/electron-builder/commit/22737b2b2db5a10785b1ed3fd05fd9d237fcd731) Thanks [@PBK-B](https://github.com/PBK-B)! - feat(mac): support macos signature `additionalArguments` parameter

- [#8159](https://github.com/electron-userland/electron-builder/pull/8159) [`15bffa00`](https://github.com/electron-userland/electron-builder/commit/15bffa00d429d9f333b737712fb3a13f5d26ea53) Thanks [@rotu](https://github.com/rotu)! - Use `APPLE_TEAM_ID` env var when using notarizing with `APPLE_ID`.
  Deprecate legacy (`altool`) notarization API.

- [#8120](https://github.com/electron-userland/electron-builder/pull/8120) [`00f46e6f`](https://github.com/electron-userland/electron-builder/commit/00f46e6f60a8a762a2094264c2f2473f0a6334be) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: support `additionalLightArgs` for msi target

- [#8142](https://github.com/electron-userland/electron-builder/pull/8142) [`8160363a`](https://github.com/electron-userland/electron-builder/commit/8160363ac2821242ab22e225a9038b56e4798cc6) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: add config options for setting `MinVersion` and `MaxVersionTested` fields in appx manifest

- [#8153](https://github.com/electron-userland/electron-builder/pull/8153) [`8e36be11`](https://github.com/electron-userland/electron-builder/commit/8e36be113489c1afa6ce5ee6cdda73049bc619a6) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: export Packager sub-classes from main electron-builder types

- [#8194](https://github.com/electron-userland/electron-builder/pull/8194) [`588c5db4`](https://github.com/electron-userland/electron-builder/commit/588c5db47c97e06b540bdc7f7a6de9a936a7603b) Thanks [@rafaberaldo](https://github.com/rafaberaldo)! - feat: add `afterExtract` hook to build process with the same payload interface as `beforePack` and `afterPack`

- [#8112](https://github.com/electron-userland/electron-builder/pull/8112) [`9edfee6d`](https://github.com/electron-userland/electron-builder/commit/9edfee6da2de0cfedafebceef0dbfea1a0a17644) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: implementing electron/rebuild with config option `nativeRebuilder` default: `legacy` to support Yarn 3 (modes: `parallel` or `sequential`)

### Patch Changes

- [#8119](https://github.com/electron-userland/electron-builder/pull/8119) [`5277354c`](https://github.com/electron-userland/electron-builder/commit/5277354c2363e66f101e306716c669a4606152bd) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency typescript-json-schema to v0.63.0

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8128](https://github.com/electron-userland/electron-builder/pull/8128) [`555dc909`](https://github.com/electron-userland/electron-builder/commit/555dc909a97cbaab5bc5df6cdf6f1176dff1e604) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix: order files within asar for smaller incremental updates

- [#8182](https://github.com/electron-userland/electron-builder/pull/8182) [`b43490a2`](https://github.com/electron-userland/electron-builder/commit/b43490a274722aba398594bcf0156d1b3687e0d2) Thanks [@duzda](https://github.com/duzda)! - feat(linux): add music mac to linux category

- [#8323](https://github.com/electron-userland/electron-builder/pull/8323) [`fa3275c0`](https://github.com/electron-userland/electron-builder/commit/fa3275c05b334f59453d04551fffa24bfa558e48) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency typescript to v5.5.3

- [#8135](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: unstable hdiutil retry mechanism

- [#8291](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48) Thanks [@IsaacAderogba](https://github.com/IsaacAderogba)! - fix: add MemoLazy to fix codeSigningInfo not responding to changed args

- [#8206](https://github.com/electron-userland/electron-builder/pull/8206) [`51111a87`](https://github.com/electron-userland/electron-builder/commit/51111a87a541ccf826dcd11393b4b3a0e83ca368) Thanks [@ifurther](https://github.com/ifurther)! - feat(appx): Update identityName for windows 10

- [#8216](https://github.com/electron-userland/electron-builder/pull/8216) [`08852365`](https://github.com/electron-userland/electron-builder/commit/088523652934b87419c15c068459627dcf9a0535) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update read-config-file dependency

- [#8286](https://github.com/electron-userland/electron-builder/pull/8286) [`4a4023c3`](https://github.com/electron-userland/electron-builder/commit/4a4023c3661b9e190e526965b894f90bdcea87ab) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix Folder's named "constructor" not being included in asar

- [#8310](https://github.com/electron-userland/electron-builder/pull/8310) [`145ecb66`](https://github.com/electron-userland/electron-builder/commit/145ecb66baabd39ca523ebbba26ef484384fe8e7) Thanks [@beyondkmp](https://github.com/beyondkmp)! - update binary checking

- [#8126](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(docs): update Bitbucket Options token doc

- [#8327](https://github.com/electron-userland/electron-builder/pull/8327) [`f9eae653`](https://github.com/electron-userland/electron-builder/commit/f9eae653985f332ead7545490c73aa27d90c35cd) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deps): update dependency minimatch to v10

- [#8124](https://github.com/electron-userland/electron-builder/pull/8124) [`e0292581`](https://github.com/electron-userland/electron-builder/commit/e02925818258954747188a5eb2ece5047452b89a) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: move `disableSanityCheckPackage` to within `checkFileInPackage` to not bypass non-asar usage

- [#8254](https://github.com/electron-userland/electron-builder/pull/8254) [`dc5d7c8d`](https://github.com/electron-userland/electron-builder/commit/dc5d7c8dafd4aca7192d05b2978c3e66f30e38f3) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: @electron/remote wrongly into Windows app.asar

- [#8133](https://github.com/electron-userland/electron-builder/pull/8133) [`44b04463`](https://github.com/electron-userland/electron-builder/commit/44b04463bf581b4c013586c9010733b518a802a4) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: replace SYSTEMROOT with $SYSDIR

- [#8227](https://github.com/electron-userland/electron-builder/pull/8227) [`48c59535`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993) Thanks [@rotu](https://github.com/rotu)! - fix(docs): update autoupdate docs noting that channels work with Github

- [#8281](https://github.com/electron-userland/electron-builder/pull/8281) [`9a0b3c6e`](https://github.com/electron-userland/electron-builder/commit/9a0b3c6e0201ba32c26b2f96e2e9abf7af2ef666) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: resolve CI/CD docs generation issue and update schema

- [#8125](https://github.com/electron-userland/electron-builder/pull/8125) [`c6c9d59e`](https://github.com/electron-userland/electron-builder/commit/c6c9d59e4cc8444ab847a14bf64364b065a384ee) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(win): use appInfo description as primary entry for FileDescription

- [#8267](https://github.com/electron-userland/electron-builder/pull/8267) [`9d559738`](https://github.com/electron-userland/electron-builder/commit/9d55973879a045111c986ddb27b37f3c1fb5a0c0) Thanks [@George-Payne](https://github.com/George-Payne)! - fix: don't log ignored error when requiring custom publisher

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

- [#8185](https://github.com/electron-userland/electron-builder/pull/8185) [`5e41c5e8`](https://github.com/electron-userland/electron-builder/commit/5e41c5e8e440f7c6d139fc0e311efa46bc2846c3) Thanks [@mifi](https://github.com/mifi)! - fix: Treat cscLink empty string same as null

- [#8271](https://github.com/electron-userland/electron-builder/pull/8271) [`3b99eb39`](https://github.com/electron-userland/electron-builder/commit/3b99eb394f41dc336c1290cf29fb7ce90a3bf6a3) Thanks [@kochie](https://github.com/kochie)! - fix: update @electron/notarize to latest version

- [#8245](https://github.com/electron-userland/electron-builder/pull/8245) [`13e0e0d2`](https://github.com/electron-userland/electron-builder/commit/13e0e0d2a272e6111024a28e1c3619dd1769366c) Thanks [@indutny-signal](https://github.com/indutny-signal)! - write asar integrity resource on windows

- [#8314](https://github.com/electron-userland/electron-builder/pull/8314) [`1337f158`](https://github.com/electron-userland/electron-builder/commit/1337f158c93d4c83ebaefb20833811fd90f05f16) Thanks [@beyondkmp](https://github.com/beyondkmp)! - change license file's encode to utf8 with BOM

- [#8101](https://github.com/electron-userland/electron-builder/pull/8101) [`9bcede88`](https://github.com/electron-userland/electron-builder/commit/9bcede88f2083d41266e48dfa712adc2d223bd7f) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix(mac): add retry mechanism in mac code signing for `electron/osx-sign`.

- [#8140](https://github.com/electron-userland/electron-builder/pull/8140) [`99a6150e`](https://github.com/electron-userland/electron-builder/commit/99a6150ea02c91a7e7e657c667328eb734e29b8f) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: update autoupdate docs to describe module-based support. set nativeRebuilder default value to use electron/rebuild

- Updated dependencies [[`503da26f`](https://github.com/electron-userland/electron-builder/commit/503da26f1ef71bff19bd173bdce4052c48ddc5cc), [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf), [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28), [`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88), [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48), [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41), [`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89), [`db1894d7`](https://github.com/electron-userland/electron-builder/commit/db1894d78a0bbf8377a787a25dddc17af22a4667), [`a999da48`](https://github.com/electron-userland/electron-builder/commit/a999da48480b5024d97c3028a655bb33b00fc3bc), [`88bbbdbe`](https://github.com/electron-userland/electron-builder/commit/88bbbdbe81936df1701f26138170e0f337c4f0d4), [`48c59535`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993), [`8e36be11`](https://github.com/electron-userland/electron-builder/commit/8e36be113489c1afa6ce5ee6cdda73049bc619a6), [`3ae3589a`](https://github.com/electron-userland/electron-builder/commit/3ae3589a63c2d915b8456d9dc81a965a1366c73b), [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)]:
  - builder-util@25.0.0
  - builder-util-runtime@9.2.5
  - dmg-builder@25.0.0
  - electron-builder-squirrel-windows@25.0.0
  - electron-publish@25.0.0

## 25.0.0-alpha.13

### Patch Changes

- [#8323](https://github.com/electron-userland/electron-builder/pull/8323) [`fa3275c0`](https://github.com/electron-userland/electron-builder/commit/fa3275c05b334f59453d04551fffa24bfa558e48) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency typescript to v5.5.3

- [#8310](https://github.com/electron-userland/electron-builder/pull/8310) [`145ecb66`](https://github.com/electron-userland/electron-builder/commit/145ecb66baabd39ca523ebbba26ef484384fe8e7) Thanks [@beyondkmp](https://github.com/beyondkmp)! - update binary checking

- [#8327](https://github.com/electron-userland/electron-builder/pull/8327) [`f9eae653`](https://github.com/electron-userland/electron-builder/commit/f9eae653985f332ead7545490c73aa27d90c35cd) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deps): update dependency minimatch to v10

- [#8314](https://github.com/electron-userland/electron-builder/pull/8314) [`1337f158`](https://github.com/electron-userland/electron-builder/commit/1337f158c93d4c83ebaefb20833811fd90f05f16) Thanks [@beyondkmp](https://github.com/beyondkmp)! - change license file's encode to utf8 with BOM

- Updated dependencies [[`db1894d7`](https://github.com/electron-userland/electron-builder/commit/db1894d78a0bbf8377a787a25dddc17af22a4667)]:
  - builder-util@25.0.0-alpha.13
  - dmg-builder@25.0.0-alpha.13
  - electron-builder-squirrel-windows@25.0.0-alpha.13
  - electron-publish@25.0.0-alpha.13

## 25.0.0-alpha.12

### Patch Changes

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8291](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48) Thanks [@IsaacAderogba](https://github.com/IsaacAderogba)! - fix: add MemoLazy to fix codeSigningInfo not responding to changed args

- Updated dependencies [[`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28), [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48)]:
  - builder-util@25.0.0-alpha.12
  - builder-util-runtime@9.2.5-alpha.4
  - dmg-builder@25.0.0-alpha.12
  - electron-builder-squirrel-windows@25.0.0-alpha.12
  - electron-publish@25.0.0-alpha.12

## 25.0.0-alpha.11

### Patch Changes

- [#8286](https://github.com/electron-userland/electron-builder/pull/8286) [`4a4023c3`](https://github.com/electron-userland/electron-builder/commit/4a4023c3661b9e190e526965b894f90bdcea87ab) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix Folder's named "constructor" not being included in asar

- Updated dependencies []:
  - dmg-builder@25.0.0-alpha.11
  - electron-builder-squirrel-windows@25.0.0-alpha.11

## 25.0.0-alpha.10

### Patch Changes

- [#8206](https://github.com/electron-userland/electron-builder/pull/8206) [`51111a87`](https://github.com/electron-userland/electron-builder/commit/51111a87a541ccf826dcd11393b4b3a0e83ca368) Thanks [@ifurther](https://github.com/ifurther)! - feat(appx): Update identityName for windows 10

- [#8254](https://github.com/electron-userland/electron-builder/pull/8254) [`dc5d7c8d`](https://github.com/electron-userland/electron-builder/commit/dc5d7c8dafd4aca7192d05b2978c3e66f30e38f3) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: @electron/remote wrongly into Windows app.asar

- [#8281](https://github.com/electron-userland/electron-builder/pull/8281) [`9a0b3c6e`](https://github.com/electron-userland/electron-builder/commit/9a0b3c6e0201ba32c26b2f96e2e9abf7af2ef666) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: resolve CI/CD docs generation issue and update schema

- [#8267](https://github.com/electron-userland/electron-builder/pull/8267) [`9d559738`](https://github.com/electron-userland/electron-builder/commit/9d55973879a045111c986ddb27b37f3c1fb5a0c0) Thanks [@George-Payne](https://github.com/George-Payne)! - fix: don't log ignored error when requiring custom publisher

- [#8271](https://github.com/electron-userland/electron-builder/pull/8271) [`3b99eb39`](https://github.com/electron-userland/electron-builder/commit/3b99eb394f41dc336c1290cf29fb7ce90a3bf6a3) Thanks [@kochie](https://github.com/kochie)! - fix: update @electron/notarize to latest version

- [#8245](https://github.com/electron-userland/electron-builder/pull/8245) [`13e0e0d2`](https://github.com/electron-userland/electron-builder/commit/13e0e0d2a272e6111024a28e1c3619dd1769366c) Thanks [@indutny-signal](https://github.com/indutny-signal)! - write asar integrity resource on windows

- Updated dependencies [[`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89), [`88bbbdbe`](https://github.com/electron-userland/electron-builder/commit/88bbbdbe81936df1701f26138170e0f337c4f0d4)]:
  - builder-util-runtime@9.2.5-alpha.3
  - builder-util@25.0.0-alpha.10
  - dmg-builder@25.0.0-alpha.10
  - electron-builder-squirrel-windows@25.0.0-alpha.10
  - electron-publish@25.0.0-alpha.10

## 25.0.0-alpha.9

### Minor Changes

- [#8190](https://github.com/electron-userland/electron-builder/pull/8190) [`503da26f`](https://github.com/electron-userland/electron-builder/commit/503da26f1ef71bff19bd173bdce4052c48ddc5cc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: update app-builder-bin to 5.0-alpha release

### Patch Changes

- [#8227](https://github.com/electron-userland/electron-builder/pull/8227) [`48c59535`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993) Thanks [@rotu](https://github.com/rotu)! - fix(docs): update autoupdate docs noting that channels work with Github

- Updated dependencies [[`503da26f`](https://github.com/electron-userland/electron-builder/commit/503da26f1ef71bff19bd173bdce4052c48ddc5cc), [`48c59535`](https://github.com/electron-userland/electron-builder/commit/48c59535f84cd16fb2e44d71f6b75c25c739b993)]:
  - builder-util@25.0.0-alpha.9
  - dmg-builder@25.0.0-alpha.9
  - electron-builder-squirrel-windows@25.0.0-alpha.9
  - electron-publish@25.0.0-alpha.9

## 25.0.0-alpha.8

### Minor Changes

- [#8218](https://github.com/electron-userland/electron-builder/pull/8218) [`22737b2b`](https://github.com/electron-userland/electron-builder/commit/22737b2b2db5a10785b1ed3fd05fd9d237fcd731) Thanks [@PBK-B](https://github.com/PBK-B)! - feat(mac): support macos signature `additionalArguments` parameter

- [#8194](https://github.com/electron-userland/electron-builder/pull/8194) [`588c5db4`](https://github.com/electron-userland/electron-builder/commit/588c5db47c97e06b540bdc7f7a6de9a936a7603b) Thanks [@rafaberaldo](https://github.com/rafaberaldo)! - feat: add `afterExtract` hook to build process with the same payload interface as `beforePack` and `afterPack`

### Patch Changes

- [#8216](https://github.com/electron-userland/electron-builder/pull/8216) [`08852365`](https://github.com/electron-userland/electron-builder/commit/088523652934b87419c15c068459627dcf9a0535) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update read-config-file dependency

- Updated dependencies []:
  - dmg-builder@25.0.0-alpha.8
  - electron-builder-squirrel-windows@25.0.0-alpha.8

## 25.0.0-alpha.7

### Patch Changes

- [#8182](https://github.com/electron-userland/electron-builder/pull/8182) [`b43490a2`](https://github.com/electron-userland/electron-builder/commit/b43490a274722aba398594bcf0156d1b3687e0d2) Thanks [@duzda](https://github.com/duzda)! - feat(linux): add music mac to linux category

- [#8185](https://github.com/electron-userland/electron-builder/pull/8185) [`5e41c5e8`](https://github.com/electron-userland/electron-builder/commit/5e41c5e8e440f7c6d139fc0e311efa46bc2846c3) Thanks [@mifi](https://github.com/mifi)! - fix: Treat cscLink empty string same as null

- Updated dependencies [[`3ae3589a`](https://github.com/electron-userland/electron-builder/commit/3ae3589a63c2d915b8456d9dc81a965a1366c73b)]:
  - electron-publish@25.0.0-alpha.7
  - dmg-builder@25.0.0-alpha.7
  - electron-builder-squirrel-windows@25.0.0-alpha.7

## 25.0.0-alpha.6

### Minor Changes

- [#8150](https://github.com/electron-userland/electron-builder/pull/8150) [`f4e6ae29`](https://github.com/electron-userland/electron-builder/commit/f4e6ae2931cbf79670b5f2c252a91bed03d96546) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: add functionality to just publish artifacts

- [#8159](https://github.com/electron-userland/electron-builder/pull/8159) [`15bffa00`](https://github.com/electron-userland/electron-builder/commit/15bffa00d429d9f333b737712fb3a13f5d26ea53) Thanks [@rotu](https://github.com/rotu)! - Use `APPLE_TEAM_ID` env var when using notarizing with `APPLE_ID`.
  Deprecate legacy (`altool`) notarization API.

- [#8142](https://github.com/electron-userland/electron-builder/pull/8142) [`8160363a`](https://github.com/electron-userland/electron-builder/commit/8160363ac2821242ab22e225a9038b56e4798cc6) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: add config options for setting `MinVersion` and `MaxVersionTested` fields in appx manifest

- [#8153](https://github.com/electron-userland/electron-builder/pull/8153) [`8e36be11`](https://github.com/electron-userland/electron-builder/commit/8e36be113489c1afa6ce5ee6cdda73049bc619a6) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: export Packager sub-classes from main electron-builder types

### Patch Changes

- Updated dependencies [[`a999da48`](https://github.com/electron-userland/electron-builder/commit/a999da48480b5024d97c3028a655bb33b00fc3bc), [`8e36be11`](https://github.com/electron-userland/electron-builder/commit/8e36be113489c1afa6ce5ee6cdda73049bc619a6)]:
  - builder-util@25.0.0-alpha.6
  - dmg-builder@25.0.0-alpha.6
  - electron-builder-squirrel-windows@25.0.0-alpha.6
  - electron-publish@25.0.0-alpha.6

## 25.0.0-alpha.5

### Patch Changes

- [#8140](https://github.com/electron-userland/electron-builder/pull/8140) [`99a6150e`](https://github.com/electron-userland/electron-builder/commit/99a6150ea02c91a7e7e657c667328eb734e29b8f) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: update autoupdate docs to describe module-based support. set nativeRebuilder default value to use electron/rebuild

- Updated dependencies []:
  - dmg-builder@25.0.0-alpha.5
  - electron-builder-squirrel-windows@25.0.0-alpha.5

## 25.0.0-alpha.4

### Patch Changes

- [#8135](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: unstable hdiutil retry mechanism

- [#8133](https://github.com/electron-userland/electron-builder/pull/8133) [`44b04463`](https://github.com/electron-userland/electron-builder/commit/44b04463bf581b4c013586c9010733b518a802a4) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: replace SYSTEMROOT with $SYSDIR

- Updated dependencies [[`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88)]:
  - builder-util@25.0.0-alpha.4
  - dmg-builder@25.0.0-alpha.4
  - electron-builder-squirrel-windows@25.0.0-alpha.4
  - electron-publish@25.0.0-alpha.4

## 25.0.0-alpha.3

### Patch Changes

- [#8128](https://github.com/electron-userland/electron-builder/pull/8128) [`555dc909`](https://github.com/electron-userland/electron-builder/commit/555dc909a97cbaab5bc5df6cdf6f1176dff1e604) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix: order files within asar for smaller incremental updates

- [#8126](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(docs): update Bitbucket Options token doc

- [#8125](https://github.com/electron-userland/electron-builder/pull/8125) [`c6c9d59e`](https://github.com/electron-userland/electron-builder/commit/c6c9d59e4cc8444ab847a14bf64364b065a384ee) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(win): use appInfo description as primary entry for FileDescription

- Updated dependencies [[`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41)]:
  - builder-util-runtime@9.2.5-alpha.2
  - dmg-builder@25.0.0-alpha.3
  - electron-builder-squirrel-windows@25.0.0-alpha.3
  - builder-util@25.0.0-alpha.3
  - electron-publish@25.0.0-alpha.3

## 25.0.0-alpha.2

### Minor Changes

- [#8123](https://github.com/electron-userland/electron-builder/pull/8123) [`031d7d5b`](https://github.com/electron-userland/electron-builder/commit/031d7d5bdf911cb6dc4b0b108f82df44f4c2b224) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add disableSanityCheckAsar to allow encrypted asars

- [#8120](https://github.com/electron-userland/electron-builder/pull/8120) [`00f46e6f`](https://github.com/electron-userland/electron-builder/commit/00f46e6f60a8a762a2094264c2f2473f0a6334be) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: support `additionalLightArgs` for msi target

### Patch Changes

- [#8119](https://github.com/electron-userland/electron-builder/pull/8119) [`5277354c`](https://github.com/electron-userland/electron-builder/commit/5277354c2363e66f101e306716c669a4606152bd) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency typescript-json-schema to v0.63.0

- [#8124](https://github.com/electron-userland/electron-builder/pull/8124) [`e0292581`](https://github.com/electron-userland/electron-builder/commit/e02925818258954747188a5eb2ece5047452b89a) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: move `disableSanityCheckPackage` to within `checkFileInPackage` to not bypass non-asar usage

- Updated dependencies []:
  - dmg-builder@25.0.0-alpha.2
  - electron-builder-squirrel-windows@25.0.0-alpha.2

## 25.0.0-alpha.1

### Minor Changes

- [#8112](https://github.com/electron-userland/electron-builder/pull/8112) [`9edfee6d`](https://github.com/electron-userland/electron-builder/commit/9edfee6da2de0cfedafebceef0dbfea1a0a17644) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: implementing electron/rebuild with config option `nativeRebuilder` default: `legacy` to support Yarn 3 (modes: `parallel` or `sequential`)

### Patch Changes

- Updated dependencies [[`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf)]:
  - builder-util-runtime@9.2.5-alpha.1
  - builder-util@25.0.0-alpha.1
  - dmg-builder@25.0.0-alpha.1
  - electron-publish@25.0.0-alpha.1
  - electron-builder-squirrel-windows@25.0.0-alpha.1

## 24.13.4-alpha.0

### Patch Changes

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

- [#8101](https://github.com/electron-userland/electron-builder/pull/8101) [`9bcede88`](https://github.com/electron-userland/electron-builder/commit/9bcede88f2083d41266e48dfa712adc2d223bd7f) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix(mac): add retry mechanism in mac code signing for `electron/osx-sign`.

- Updated dependencies [[`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)]:
  - builder-util@24.13.4-alpha.0
  - builder-util-runtime@9.2.5-alpha.0
  - dmg-builder@24.13.4-alpha.0
  - electron-builder-squirrel-windows@24.13.4-alpha.0
  - electron-publish@24.13.4-alpha.0

## 24.13.3

### Patch Changes

- [#8086](https://github.com/electron-userland/electron-builder/pull/8086) [`e6f1bebd`](https://github.com/electron-userland/electron-builder/commit/e6f1bebd96cbc54f7455cd9bd48bb1eadc5648f5) Thanks [@Allan-Kerr](https://github.com/Allan-Kerr)! - fix(msi): build emulated arm64 MSI installers as stopgap until electron-builder-binaries wix version is updated

- [#8090](https://github.com/electron-userland/electron-builder/pull/8090) [`2c147add`](https://github.com/electron-userland/electron-builder/commit/2c147addb09385008cf661c952e7ce390a254d8e) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(mac): sign NSIS on mac

- [#8067](https://github.com/electron-userland/electron-builder/pull/8067) [`18340eef`](https://github.com/electron-userland/electron-builder/commit/18340eef6d8e9ee6efbf528508bac7972168bedb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deb): soft symlink instead of hardlink to handle when /opt is on a separate partition

- Updated dependencies []:
  - dmg-builder@24.13.3
  - electron-builder-squirrel-windows@24.13.3

## 24.13.2

### Patch Changes

- [#8059](https://github.com/electron-userland/electron-builder/pull/8059) [`8f4acff3`](https://github.com/electron-userland/electron-builder/commit/8f4acff3c2d45c1cb07779bb3fe79644408ee387) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: execute %SYSTEMROOT% cmd.exe directly during NSIS installer

- [#8071](https://github.com/electron-userland/electron-builder/pull/8071) [`eb296c9b`](https://github.com/electron-userland/electron-builder/commit/eb296c9b2afd77db799eadd472f9ec22f6fc4354) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(pkg): provide `BundlePreInstallScriptPath` and/or `BundlePostInstallScriptPath` when a pre/postinstall script is provided to pkg installer

- [#8069](https://github.com/electron-userland/electron-builder/pull/8069) [`538dd86b`](https://github.com/electron-userland/electron-builder/commit/538dd86bf52f0091dbb1120bdd30f56dfdbd5747) Thanks [@lutzroeder](https://github.com/lutzroeder)! - fix: use `pathToFileUrl` for hooks for Windows ES module support

- [#8065](https://github.com/electron-userland/electron-builder/pull/8065) [`5681777a`](https://github.com/electron-userland/electron-builder/commit/5681777a808d49756f3a95d18cc589218be44878) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(mac): only skip notarization step when `notarize` is explicitly false

- Updated dependencies []:
  - dmg-builder@24.13.2
  - electron-builder-squirrel-windows@24.13.2

## 24.13.1

### Patch Changes

- [#8052](https://github.com/electron-userland/electron-builder/pull/8052) [`6a4f605f`](https://github.com/electron-userland/electron-builder/commit/6a4f605f9ae1a1de02a8260ffe054f74fbd097a5) Thanks [@taozhou-glean](https://github.com/taozhou-glean)! - fix: add dmg-builder and squirrel-windows to peer dependency for pnpm

- [#8057](https://github.com/electron-userland/electron-builder/pull/8057) [`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: upgrading connected dependencies (typescript requires higher eslint version)

- Updated dependencies [[`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e)]:
  - builder-util@24.13.1
  - builder-util-runtime@9.2.4
  - dmg-builder@24.13.1
  - electron-builder-squirrel-windows@24.13.1
  - electron-publish@24.13.1

## 24.13.0

### Minor Changes

- [#8043](https://github.com/electron-userland/electron-builder/pull/8043) [`bb4a8c09`](https://github.com/electron-userland/electron-builder/commit/bb4a8c09318045938bfff5a0d1db8f17f0fa4e8c) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: allow `onNodeModuleFile` to return a boolean to force include the package to be copied

### Patch Changes

- [#8042](https://github.com/electron-userland/electron-builder/pull/8042) [`63a00443`](https://github.com/electron-userland/electron-builder/commit/63a00443cf4bae9d7406f7e879ea607632da08b8) Thanks [@mmaietta](https://github.com/mmaietta)! - Attempt dynamically importing hook as a module if package.json `type=module`, if fail, fallback to default `require`

- [#8035](https://github.com/electron-userland/electron-builder/pull/8035) [`94677f3d`](https://github.com/electron-userland/electron-builder/commit/94677f3d70866582635c717b042194f0c75bbf01) Thanks [@davej](https://github.com/davej)! - fix(mac): merge `fileAssociations` with existing `CFBundleDocumentTypes` if defined in `mac.extendInfo`

- [#8022](https://github.com/electron-userland/electron-builder/pull/8022) [`9d1d1508`](https://github.com/electron-userland/electron-builder/commit/9d1d150896a763d3630418bf5be8fd3a070c0c40) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(mac): Update mac notarize keychain env var to be optional

- Updated dependencies [[`f5340b73`](https://github.com/electron-userland/electron-builder/commit/f5340b732dc0a303743a2a924750e9861e3a345f)]:
  - electron-publish@24.13.0

## 24.12.0

### Minor Changes

- [#8002](https://github.com/electron-userland/electron-builder/pull/8002) [`adf97dcc`](https://github.com/electron-userland/electron-builder/commit/adf97dccd0146288ab482a261b749d67a458868a) Thanks [@scottnonnenberg-signal](https://github.com/scottnonnenberg-signal)! - mac: Support for a custom 'sign' action

### Patch Changes

- [#7978](https://github.com/electron-userland/electron-builder/pull/7978) [`27734100`](https://github.com/electron-userland/electron-builder/commit/277341000a87abaa65a7985854c06e88ed5938b9) Thanks [@mvitale1989](https://github.com/mvitale1989)! - Use ~ as pre-release separator for deb targets

- [#7998](https://github.com/electron-userland/electron-builder/pull/7998) [`61dfe7fb`](https://github.com/electron-userland/electron-builder/commit/61dfe7fbaa592785353348a16abd1525dcbfaf28) Thanks [@dbrnz](https://github.com/dbrnz)! - Use full path to macOS signing utilities

## 24.11.0

### Minor Changes

- [#7967](https://github.com/electron-userland/electron-builder/pull/7967) [`28e5b5dd`](https://github.com/electron-userland/electron-builder/commit/28e5b5ddb6bb2d77ef6847fc0c93e62c97174156) Thanks [@jmeinke](https://github.com/jmeinke)! - feat(nsis): add NsisOption to specify selectPerMachineByDefault

### Patch Changes

- [#7971](https://github.com/electron-userland/electron-builder/pull/7971) [`8803852c`](https://github.com/electron-userland/electron-builder/commit/8803852c7aadf56771f537dc33ffd51c14830f50) Thanks [@OrbitZore](https://github.com/OrbitZore)! - feat(archive): skip archive when destination file is already up to date

- [#7955](https://github.com/electron-userland/electron-builder/pull/7955) [`88e61bc4`](https://github.com/electron-userland/electron-builder/commit/88e61bc410fae8c0bea0b2029ee1347864af98ac) Thanks [@bayun2](https://github.com/bayun2)! - fix(win): product file name is too long causes the find process exe to fail

- [#7951](https://github.com/electron-userland/electron-builder/pull/7951) [`869c7e46`](https://github.com/electron-userland/electron-builder/commit/869c7e4652a5d5a3562e25723d6cedd622ab657b) Thanks [@bcomnes](https://github.com/bcomnes)! - fix: notarization with an apple API key

## 24.10.0

### Minor Changes

- [#7902](https://github.com/electron-userland/electron-builder/pull/7902) [`843d5017`](https://github.com/electron-userland/electron-builder/commit/843d5017f0303cf6d5a71564aad73dd15ca75d88) Thanks [@3v1n0](https://github.com/3v1n0)! - feat(snap): Use core20 as default base

- [#7936](https://github.com/electron-userland/electron-builder/pull/7936) [`664a09c4`](https://github.com/electron-userland/electron-builder/commit/664a09c4471f46a5b88be0b8e26f24b1a0b2bcc1) Thanks [@lutzroeder](https://github.com/lutzroeder)! - feat: Enable ESM support for hooks by using dynamic `import()` when `package.json` is set to type `module`.

## 24.9.4

### Patch Changes

- [#7930](https://github.com/electron-userland/electron-builder/pull/7930) [`e4d6be81`](https://github.com/electron-userland/electron-builder/commit/e4d6be81d80ce9de0c95288d4418bbb80f7902af) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: consolidating usages of `7zip-bin` to builder-util-runtime so as to execute `chmod` logic _always_

- [#7931](https://github.com/electron-userland/electron-builder/pull/7931) [`f7aacabd`](https://github.com/electron-userland/electron-builder/commit/f7aacabd9cc1b98e365134004aafa31566c7d801) Thanks [@mmaietta](https://github.com/mmaietta)! - Allowing `test.js` in compiled asar to allow testing mechanisms like Playwright

- [#7919](https://github.com/electron-userland/electron-builder/pull/7919) [`4e930a74`](https://github.com/electron-userland/electron-builder/commit/4e930a74d7c2e9b53d47e37997b444da95680a24) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: pull `resultOutputPath` from `CustomWindowsSignTaskConfiguration` (fixes: #7910)

- [#7929](https://github.com/electron-userland/electron-builder/pull/7929) [`0f439890`](https://github.com/electron-userland/electron-builder/commit/0f439890229431f02c7f86d5bf523e940e217657) Thanks [@jebibot](https://github.com/jebibot)! - fix macOS app signature when the name contains NFD-normalized characters

- [#7915](https://github.com/electron-userland/electron-builder/pull/7915) [`8b91d315`](https://github.com/electron-userland/electron-builder/commit/8b91d315727bfbac2ec2c2109f12aa92cf6f6c15) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(docs): Update docs to include `msi-wrapped` target

- Updated dependencies [[`e4d6be81`](https://github.com/electron-userland/electron-builder/commit/e4d6be81d80ce9de0c95288d4418bbb80f7902af)]:
  - builder-util@24.9.4
  - electron-publish@24.9.4

## 24.9.3

### Patch Changes

- [#7908](https://github.com/electron-userland/electron-builder/pull/7908) [`9fc51578`](https://github.com/electron-userland/electron-builder/commit/9fc5157879bfa380a78003ff13cdbc26b5e8fd23) Thanks [@Rychu-Pawel](https://github.com/Rychu-Pawel)! - fix: pass publish options to snap publisher

## 24.9.2

### Patch Changes

- [#7896](https://github.com/electron-userland/electron-builder/pull/7896) [`65817e0e`](https://github.com/electron-userland/electron-builder/commit/65817e0edc43a2e6707fab835b0bbe680bd0b1e4) Thanks [@dahchon](https://github.com/dahchon)! - fix notary with pure api key auth

- [#7901](https://github.com/electron-userland/electron-builder/pull/7901) [`f83f05f6`](https://github.com/electron-userland/electron-builder/commit/f83f05f6f24a36b96d0e0c7786e1a12e5c762389) Thanks [@jebibot](https://github.com/jebibot)! - fix codesign and DMG layout when productName or executableName contains Unicode

- [#7900](https://github.com/electron-userland/electron-builder/pull/7900) [`3b3a6989`](https://github.com/electron-userland/electron-builder/commit/3b3a69895f0caa3870219bc0bec7420de81a07ed) Thanks [@jebibot](https://github.com/jebibot)! - fix macOS app with exectuableName different from productName

## 24.9.1

### Patch Changes

- [#7885](https://github.com/electron-userland/electron-builder/pull/7885) [`3c266271`](https://github.com/electron-userland/electron-builder/commit/3c26627182a660b6f22c1fa8eb22c714f014783f) Thanks [@mifi](https://github.com/mifi)! - docs: update notarization docs in schema

- [#7886](https://github.com/electron-userland/electron-builder/pull/7886) [`d7e39f05`](https://github.com/electron-userland/electron-builder/commit/d7e39f05c55287ea32fd0f978ecb41078931d6b6) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(mac): pass in correct notarize options

- [#7884](https://github.com/electron-userland/electron-builder/pull/7884) [`6fa8a27f`](https://github.com/electron-userland/electron-builder/commit/6fa8a27f9dd406c289f608c664c93b6ed9d1a9ee) Thanks [@mifi](https://github.com/mifi)! - fix: mac notarization issue checking password

## 24.9.0

### Minor Changes

- [#7861](https://github.com/electron-userland/electron-builder/pull/7861) [`906ffb1f`](https://github.com/electron-userland/electron-builder/commit/906ffb1fcebe6aef4dc6c6a3fab10aa7d9378c3f) Thanks [@mifi](https://github.com/mifi)! - feat: allow api key and keychain to be provided for mac notarization

### Patch Changes

- [#7875](https://github.com/electron-userland/electron-builder/pull/7875) [`9883ab60`](https://github.com/electron-userland/electron-builder/commit/9883ab60687b67c858b16f09eea6f8af76cf01b0) Thanks [@achim-k](https://github.com/achim-k)! - fix: flatpak build fails due to too large icons

## 24.8.1

### Patch Changes

- [#7829](https://github.com/electron-userland/electron-builder/pull/7829) [`1af7447e`](https://github.com/electron-userland/electron-builder/commit/1af7447edf47303de03ca2924727c78118161c60) Thanks [@lutzroeder](https://github.com/lutzroeder)! - fix(deps): Update 7zip-bin to support Windows on ARM

- [#7838](https://github.com/electron-userland/electron-builder/pull/7838) [`87eae1cc`](https://github.com/electron-userland/electron-builder/commit/87eae1cc2f85f034f1543840b20d56e89a23c0df) Thanks [@mifi](https://github.com/mifi)! - fix: don't notarize mas builds

- Updated dependencies [[`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f), [`1af7447e`](https://github.com/electron-userland/electron-builder/commit/1af7447edf47303de03ca2924727c78118161c60), [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f)]:
  - builder-util-runtime@9.2.3
  - builder-util@24.8.1
  - electron-publish@24.8.1

## 24.8.0

### Minor Changes

- [#7828](https://github.com/electron-userland/electron-builder/pull/7828) [`7c7db837`](https://github.com/electron-userland/electron-builder/commit/7c7db837bdf650228594a30114975f1581c37130) Thanks [@BrandonXLF](https://github.com/BrandonXLF)! - fix: support executableName in main config

### Patch Changes

- [#7813](https://github.com/electron-userland/electron-builder/pull/7813) [`f2a1f1ee`](https://github.com/electron-userland/electron-builder/commit/f2a1f1ee9a1387eb183b9f3b0dfcca29c7891bd1) Thanks [@jgresham](https://github.com/jgresham)! - minor addition to docs for snap. add snap recommended core22 option.

- [#7831](https://github.com/electron-userland/electron-builder/pull/7831) [`6e41480e`](https://github.com/electron-userland/electron-builder/commit/6e41480e6221693f6fec46ae813d513935e05f66) Thanks [@vespasianvs](https://github.com/vespasianvs)! - fix(nsis): display product names with an `&` properly

- [#7814](https://github.com/electron-userland/electron-builder/pull/7814) [`549d07b0`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a) Thanks [@jgresham](https://github.com/jgresham)! - minor addition to docs for snap publishing. add snapcraft link to local and cd auth options

- [#7798](https://github.com/electron-userland/electron-builder/pull/7798) [`526e075e`](https://github.com/electron-userland/electron-builder/commit/526e075edddf908b9688e108a18fbb76e6f047be) Thanks [@iffy](https://github.com/iffy)! - fix: run nsis and portable builds sequentially. fixes #7791

- Updated dependencies [[`549d07b0`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a)]:
  - builder-util-runtime@9.2.2
  - builder-util@24.8.0
  - electron-publish@24.8.0

## 24.7.0

### Minor Changes

- [#7790](https://github.com/electron-userland/electron-builder/pull/7790) [`1a412f4d`](https://github.com/electron-userland/electron-builder/commit/1a412f4d07304fcd0404ac04b5085ffd394db6cf) Thanks [@xianyunleo](https://github.com/xianyunleo)! - feat: add customUnWelcomePage macro for NSIS installers

### Patch Changes

- [#7797](https://github.com/electron-userland/electron-builder/pull/7797) [`efd48dc0`](https://github.com/electron-userland/electron-builder/commit/efd48dc07bdc12894e1494136448176dc8a6c4bb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Extract `NotarizeNotaryOptions` and `NotarizeLegacyOptions` to explicitly define required vars

- [#7792](https://github.com/electron-userland/electron-builder/pull/7792) [`84906bc8`](https://github.com/electron-userland/electron-builder/commit/84906bc899c1b6ad2a9ec9bb9a249849e05133b5) Thanks [@dkaser](https://github.com/dkaser)! - fix: exclude electron-builder.env from app to avoid packaging env secrets

- [#7763](https://github.com/electron-userland/electron-builder/pull/7763) [`0cb19132`](https://github.com/electron-userland/electron-builder/commit/0cb1913272c0cf24603233e2033d8fc3f33cb26d) Thanks [@NewSilen](https://github.com/NewSilen)! - fix: expand macro for ${version}/.icon-ico/ dir on Window's installers

## 24.6.5

### Patch Changes

- [#7744](https://github.com/electron-userland/electron-builder/pull/7744) [`4fc7a3c3`](https://github.com/electron-userland/electron-builder/commit/4fc7a3c3b857380bcbdd2a10e26989e3b1af50a2) Thanks [@Koppel-Zhou](https://github.com/Koppel-Zhou)! - fix(mac): fix errors using native modules that require rebuild when both mas and mac targets are specified

## 24.6.4

### Patch Changes

- [#7736](https://github.com/electron-userland/electron-builder/pull/7736) [`445b7f5d`](https://github.com/electron-userland/electron-builder/commit/445b7f5d066781f3938fd6bcaca1d9a12f5b0eeb) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: updating @electron/osx-sign to latest version to handle preAutoEntitlements

- [#7707](https://github.com/electron-userland/electron-builder/pull/7707) [`4517d97f`](https://github.com/electron-userland/electron-builder/commit/4517d97f48d822f446c48937df4b542a638fcab6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): updating @electron notarize, osx-sign, and universal packages and pinning versions

- [#7715](https://github.com/electron-userland/electron-builder/pull/7715) [`66bef0f7`](https://github.com/electron-userland/electron-builder/commit/66bef0f7f1a0371ff924d29ed5453f9b3222c1ab) Thanks [@guohaolay](https://github.com/guohaolay)! - fix: Only schedule upload for unique files after `afterAllArtifactBuild`

## 24.6.3

### Patch Changes

- [#7685](https://github.com/electron-userland/electron-builder/pull/7685) [`78448af0`](https://github.com/electron-userland/electron-builder/commit/78448af062e2ce70c1eb590c05cce01919933e26) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: allow explicit configuration on what additional files to sign. Do not sign .node files by default

## 24.6.2

### Patch Changes

- [#7679](https://github.com/electron-userland/electron-builder/pull/7679) [`f5d23ef4`](https://github.com/electron-userland/electron-builder/commit/f5d23ef4edce6096759a3e25dfe453366ab72da2) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: add back missing `createLazyProductionDeps` that was missed during revert

## 24.6.1

### Patch Changes

- [#7668](https://github.com/electron-userland/electron-builder/pull/7668) [`9cfd35d5`](https://github.com/electron-userland/electron-builder/commit/9cfd35d5ad320255d88be67530ce5fe6e832f862) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: reverting migration to electron-rebuild to resolve native prebuilt modules issue

## 24.6.0

### Minor Changes

- [#7642](https://github.com/electron-userland/electron-builder/pull/7642) [`2717282c`](https://github.com/electron-userland/electron-builder/commit/2717282cbff0dc0b6dee7e5af1fa0ecfcff1d5bf) Thanks [@taozhou-glean](https://github.com/taozhou-glean)! - feat: Added support for overriding ‘preAutoEntitlements’ for electron/osx-sign

### Patch Changes

- [#7643](https://github.com/electron-userland/electron-builder/pull/7643) [`5fec6864`](https://github.com/electron-userland/electron-builder/commit/5fec686412b23614bf17f76d03fecc66c220ac99) Thanks [@taozhou-glean](https://github.com/taozhou-glean)! - fix: use nullish coalescing operator for hardenedRuntime default value

- [#7648](https://github.com/electron-userland/electron-builder/pull/7648) [`84ed3ff1`](https://github.com/electron-userland/electron-builder/commit/84ed3ff123b5ae92cd3350d64677434f9b397b76) Thanks [@l3m0nqu1z](https://github.com/l3m0nqu1z)! - fix: re-enable changeDir step for assisted, perMachine installs

## 24.5.2

### Patch Changes

- [#7630](https://github.com/electron-userland/electron-builder/pull/7630) [`37db080f`](https://github.com/electron-userland/electron-builder/commit/37db080ffabf546132d278ff69532b0558ad0a41) Thanks [@m4rch3n1ng](https://github.com/m4rch3n1ng)! - fix(linux): make semver pre-release versions valid for `"pacman"` and `"rpm"` target

## 24.5.1

### Patch Changes

- [#7629](https://github.com/electron-userland/electron-builder/pull/7629) [`285aa766`](https://github.com/electron-userland/electron-builder/commit/285aa766c2675448689f2e465b6fa2b2acacdbc6) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: use electron/rebuild Rebuilder directly for cross-platform builds

- [#7622](https://github.com/electron-userland/electron-builder/pull/7622) [`46524169`](https://github.com/electron-userland/electron-builder/commit/46524169cefbfa18e342d7fa19e79e710aae848e) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(mac): use Identity `hash` instead of `name` if it exists

## 24.5.0

### Minor Changes

- [#7609](https://github.com/electron-userland/electron-builder/pull/7609) [`99f49cf7`](https://github.com/electron-userland/electron-builder/commit/99f49cf7a86afa33d35652ffc6329fefed2e5f75) Thanks [@panther7](https://github.com/panther7)! - Added env variable for 7z filter

### Patch Changes

- [#7603](https://github.com/electron-userland/electron-builder/pull/7603) [`f464e3ee`](https://github.com/electron-userland/electron-builder/commit/f464e3ee6b8a6330a9be2961afaaec150777f91c) Thanks [@GabrielNSD](https://github.com/GabrielNSD)! - fix: Allow building MAS and dmg targets with different appId

- [#7552](https://github.com/electron-userland/electron-builder/pull/7552) [`e3fc9b54`](https://github.com/electron-userland/electron-builder/commit/e3fc9b544cc8c6728ffd77a45408d6e0e87dbb46) Thanks [@p2004a](https://github.com/p2004a)! - fix(nsis): Ensure application name sub-folder on fresh installs.

- Updated dependencies [[`4dce3718`](https://github.com/electron-userland/electron-builder/commit/4dce3718abd75b8d0e29f37f6ba0ee1e76353c65)]:
  - builder-util@24.5.0
  - electron-publish@24.5.0

## 24.4.0

### Minor Changes

- [#7558](https://github.com/electron-userland/electron-builder/pull/7558) [`54c85374`](https://github.com/electron-userland/electron-builder/commit/54c85374790f7a8e0dc520a20c716b4afe69be20) Thanks [@t3chguy](https://github.com/t3chguy)! - Add ability to specify recommended deb dependencies

### Patch Changes

- [#7529](https://github.com/electron-userland/electron-builder/pull/7529) [`60eb5558`](https://github.com/electron-userland/electron-builder/commit/60eb55584d82cc72d6d546e1a51198d3e4b91ad3) Thanks [@NoahAndrews](https://github.com/NoahAndrews)! - When using the msiWrapped target, allow the nsis target to be capitalized in the configuration file

- [#7568](https://github.com/electron-userland/electron-builder/pull/7568) [`c9d20db9`](https://github.com/electron-userland/electron-builder/commit/c9d20db964cce991dab137ec0105d40d8eacd95c) Thanks [@t3chguy](https://github.com/t3chguy)! - Fix missing @types dependencies for output d.ts files

- Updated dependencies [[`c9d20db9`](https://github.com/electron-userland/electron-builder/commit/c9d20db964cce991dab137ec0105d40d8eacd95c)]:
  - builder-util@24.4.0
  - electron-publish@24.4.0

## 24.3.0

### Minor Changes

- [#7531](https://github.com/electron-userland/electron-builder/pull/7531) [`0db9c66f`](https://github.com/electron-userland/electron-builder/commit/0db9c66f0fff9a482d34aeaafaf11f542b786bf8) Thanks [@inickvel](https://github.com/inickvel)! - Display "Space required" text for NSIS installer

### Patch Changes

- [#7560](https://github.com/electron-userland/electron-builder/pull/7560) [`592570b7`](https://github.com/electron-userland/electron-builder/commit/592570b72e7fc5caab6352805eadf149c637c420) Thanks [@davej](https://github.com/davej)! - chore: Update `@electron/rebuild`

- [#7557](https://github.com/electron-userland/electron-builder/pull/7557) [`22bc9370`](https://github.com/electron-userland/electron-builder/commit/22bc93707ca9af1b6be487f91589813e392726a2) Thanks [@t3chguy](https://github.com/t3chguy)! - Update link to fpm docs

- Updated dependencies [[`dab3aeba`](https://github.com/electron-userland/electron-builder/commit/dab3aeba2240ead4300c8fdb35e3d9c16b04a23d), [`0db9c66f`](https://github.com/electron-userland/electron-builder/commit/0db9c66f0fff9a482d34aeaafaf11f542b786bf8)]:
  - builder-util-runtime@9.2.1
  - builder-util@24.3.0
  - electron-publish@24.3.0

## 24.2.1

### Patch Changes

- [#7541](https://github.com/electron-userland/electron-builder/pull/7541) [`a4888ac4`](https://github.com/electron-userland/electron-builder/commit/a4888ac490e4e5d3783858d27acd487b2b8444fd) Thanks [@yannickm95](https://github.com/yannickm95)! - Update `@electron/rebuild` to version `^3.2.11` and account for the new folder structure of the package.

- [#7501](https://github.com/electron-userland/electron-builder/pull/7501) [`e83dc814`](https://github.com/electron-userland/electron-builder/commit/e83dc814725f543c6b51721fdbfee83158d35084) Thanks [@markizano](https://github.com/markizano)! - Use `update-alternatives` when available.

  ## What is changing?

  Test for `update-alternatives` in DEB based installations and use this whenever possible.
  In this way, middleware and downstream projects and users can specify binaries of their
  own priority that would override this programs' configured executable.

  ## Why is this changing?

  Personally, I don't want apps running as myself or a privileged user in my system.
  For this. I have a shell that is executed to drop permissions first, then execute the
  selected software.
  Electron apps don't conform to this since they link directly rather than using a linking
  system.

  This change is to ensure that system is used before resorting to direct links.

  ## How should this be consumed?

  Simply update as normal and this package will switch to using update-alternatives.
  This will allow middleware and end-users to better control the active executable.

## 24.2.0

### Minor Changes

- [#7516](https://github.com/electron-userland/electron-builder/pull/7516) [`1533501f`](https://github.com/electron-userland/electron-builder/commit/1533501f999b364b656cdaa2048a1a7fd5e7c361) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Moved `electronLanguages` to global config to support win/linux

## 24.1.3

### Patch Changes

- [#7519](https://github.com/electron-userland/electron-builder/pull/7519) [`abf37039`](https://github.com/electron-userland/electron-builder/commit/abf370395f45e4005f12131c532325a1e3232309) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: "Can't reconcile two non-macho files" due to `disablePreGypCopy` functionality in new electron/rebuild integration

## 24.1.2

### Patch Changes

- [#7511](https://github.com/electron-userland/electron-builder/pull/7511) [`16283cca`](https://github.com/electron-userland/electron-builder/commit/16283ccaf5788b1a60c28f6d1424f72eebecea46) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: utilizing frameworkInfo as primary manner of fetching electron version for installation. (fixes: #7494)

- Updated dependencies [[`d4c90b67`](https://github.com/electron-userland/electron-builder/commit/d4c90b676aa22c745de4129f98453b97f264805c)]:
  - builder-util@24.1.2
  - electron-publish@24.1.2

## 24.1.1

### Patch Changes

- [#7495](https://github.com/electron-userland/electron-builder/pull/7495) [`91f86aed`](https://github.com/electron-userland/electron-builder/commit/91f86aed093a78cd43e60126ebd48fa88ce7727a) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: removing ffmpeg dependency due to dependency vulnerability

## 24.1.0

### Minor Changes

- [#7477](https://github.com/electron-userland/electron-builder/pull/7477) [`1dd26cc6`](https://github.com/electron-userland/electron-builder/commit/1dd26cc646c1a9708ff880920319bdaad17d20ba) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding new `downloadAlternateFFmpeg` option to download non-proprietary ffmpeg library

### Patch Changes

- [`2a6662eb`](https://github.com/electron-userland/electron-builder/commit/2a6662eb9fe5473bc348828a96311978b7c42855) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: missing quote syntax error in nsis uninstaller

- [#7491](https://github.com/electron-userland/electron-builder/pull/7491) [`c1deace1`](https://github.com/electron-userland/electron-builder/commit/c1deace1de707faacb02ae49cfaa59d60ab6ac06) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: updating SignOptions to leverage `optionsForFile` for entitlements

- Updated dependencies [[`1342f872`](https://github.com/electron-userland/electron-builder/commit/1342f872f98229cf6c31069253fcf0f435bfd9df)]:
  - builder-util@24.1.0
  - electron-publish@24.1.0

## 24.0.0

### Major Changes

- [#7198](https://github.com/electron-userland/electron-builder/pull/7198) [`a2ce9a77`](https://github.com/electron-userland/electron-builder/commit/a2ce9a77c04868e9c01ad76b10955499f1f42eb3) Thanks [@fangpenlin](https://github.com/fangpenlin)! - Extending `linux` executableArgs option to be utilized for Snap target

- [#7320](https://github.com/electron-userland/electron-builder/pull/7320) [`2852cb56`](https://github.com/electron-userland/electron-builder/commit/2852cb56a337709f8b7f0bcbf92b034ec8a07e7f) Thanks [@filfreire](https://github.com/filfreire)! - Add base option for snapcraft

- [#7388](https://github.com/electron-userland/electron-builder/pull/7388) [`1cb8f50c`](https://github.com/electron-userland/electron-builder/commit/1cb8f50c3551b398e20b798aba0c60bb34860b49) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(BREAKING): Execute `afterSign` hook only when signing is completed, otherwise skip

- [#7196](https://github.com/electron-userland/electron-builder/pull/7196) [`5616f23c`](https://github.com/electron-userland/electron-builder/commit/5616f23ce3d03a4e71c7b7bd515ec958b1631b8b) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Migrate to electron-rebuild for handling native dependencies

- [#7361](https://github.com/electron-userland/electron-builder/pull/7361) [`f9f23bef`](https://github.com/electron-userland/electron-builder/commit/f9f23bef64efd429f6dfd1ec81f2d73927f63a8e) Thanks [@filfreire](https://github.com/filfreire)! - Remove spctl check from Mac notarization step

- [#7378](https://github.com/electron-userland/electron-builder/pull/7378) [`db69a187`](https://github.com/electron-userland/electron-builder/commit/db69a1875d219310b3050b35cdc46c20ec45cc04) Thanks [@filfreire](https://github.com/filfreire)! - Remove extra adapter field if core22 is set as base for snapcraft

### Minor Changes

- [#7373](https://github.com/electron-userland/electron-builder/pull/7373) [`9700c753`](https://github.com/electron-userland/electron-builder/commit/9700c75331e7d8de4efd257d8774b8c2a422538b) Thanks [@indutny-signal](https://github.com/indutny-signal)! - feat: optional vendor information in releaseInfo

- [#7351](https://github.com/electron-userland/electron-builder/pull/7351) [`1e8dad8b`](https://github.com/electron-userland/electron-builder/commit/1e8dad8bc58f53780c9fac3b0c48e248a8b5467c) Thanks [@filfreire](https://github.com/filfreire)! - Update MacOS signOptions on macPackager

- [#7314](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa) Thanks [@lbestftr](https://github.com/lbestftr)! - added the accelerate option to handle accelerated s3 buckets

- [#7310](https://github.com/electron-userland/electron-builder/pull/7310) [`00d0dbc2`](https://github.com/electron-userland/electron-builder/commit/00d0dbc2d74fbac3e9ce7a046427c1e1d9a11301) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: integrating @electron/notarize into mac signing flow

- [#7251](https://github.com/electron-userland/electron-builder/pull/7251) [`45a0f82a`](https://github.com/electron-userland/electron-builder/commit/45a0f82ac3a14fedfb03880fb43d525a51cec864) Thanks [@ptol](https://github.com/ptol)! - feat(nsis): add ShutdownBlockReasonCreate for blocking Windowns Shutdown alert/prompt

- [#7060](https://github.com/electron-userland/electron-builder/pull/7060) [`1d130012`](https://github.com/electron-userland/electron-builder/commit/1d130012737e77b57c8923fcc0e6ad2cbc5da0e8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Introducing deb and rpm auto-updates as beta feature

- [#7180](https://github.com/electron-userland/electron-builder/pull/7180) [`edb28c09`](https://github.com/electron-userland/electron-builder/commit/edb28c093ab251470e9f1579cd58b4f2ed89e21d) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: enabling typescript config files (i.e. electron-builder.ts)

### Patch Changes

- [#7174](https://github.com/electron-userland/electron-builder/pull/7174) [`0f9865dc`](https://github.com/electron-userland/electron-builder/commit/0f9865dc0775f9d80d3bd64cf3e2131be3ae9acb) Thanks [@faern](https://github.com/faern)! - Allow non-semver version formats on Windows

- [#7382](https://github.com/electron-userland/electron-builder/pull/7382) [`bb376875`](https://github.com/electron-userland/electron-builder/commit/bb37687540aa254bce6a92a86c56b606cc16f2be) Thanks [@radex](https://github.com/radex)! - fix: Allow MAS builds to be unsigned if `identity: null` is explicitly passed

- [#7383](https://github.com/electron-userland/electron-builder/pull/7383) [`e5748b3d`](https://github.com/electron-userland/electron-builder/commit/e5748b3df35676cf6e411c6c47fc4fc56e0a26f2) Thanks [@radex](https://github.com/radex)! - fix: MAS builds should respect arch suffix per `defaultArch` config

- [#7215](https://github.com/electron-userland/electron-builder/pull/7215) [`0d3b87f7`](https://github.com/electron-userland/electron-builder/commit/0d3b87f7b89eb2e8f43613acec0e7e057bca88ab) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Using electron-rebuild for finding project root for native node addons to correctly handle monorepo setups

- [`45c07e3e`](https://github.com/electron-userland/electron-builder/commit/45c07e3e063e89a6f8a82e8ae5ef7a2453ff161a) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: enable signing of .node modules in order to support WDAC

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

- [#7407](https://github.com/electron-userland/electron-builder/pull/7407) [`a3387309`](https://github.com/electron-userland/electron-builder/commit/a3387309f0297cb824926bd7fa5cb653da9f24ca) Thanks [@ghost1face](https://github.com/ghost1face)! - feat: Allow for NSIS windows installer to be wrapped in an MSI

- [#7339](https://github.com/electron-userland/electron-builder/pull/7339) [`8f94978c`](https://github.com/electron-userland/electron-builder/commit/8f94978c41d63e9fb4aa70a1df67f25804fdaf84) Thanks [@zanzara](https://github.com/zanzara)! - fix: add missing html extension for multi language license files in nsis target

- [#7387](https://github.com/electron-userland/electron-builder/pull/7387) [`aeffe080`](https://github.com/electron-userland/electron-builder/commit/aeffe080e07f11057134947e09021cd9d6712935) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: reset `GYP_MSVS_VERSION` for multi-arch builds before `beforePack`

- [#7431](https://github.com/electron-userland/electron-builder/pull/7431) [`eb842f7f`](https://github.com/electron-userland/electron-builder/commit/eb842f7faee3a261635fb3e59230e09c98840e40) Thanks [@nsrCodes](https://github.com/nsrCodes)! - fix packager: return success status from doSign function calls

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- [#7188](https://github.com/electron-userland/electron-builder/pull/7188) [`3816d4f3`](https://github.com/electron-userland/electron-builder/commit/3816d4f30371345def83a0667d67648790259605) Thanks [@taratatach](https://github.com/taratatach)! - docs: Warn users not to disable zip for macos if using auto-update

- [#7275](https://github.com/electron-userland/electron-builder/pull/7275) [`5668dc20`](https://github.com/electron-userland/electron-builder/commit/5668dc204b83ae0c1edf79a4998f41292007d230) Thanks [@Mstrodl](https://github.com/Mstrodl)! - Fixes a bug where signtool might not be used in a windows VM

- [#7432](https://github.com/electron-userland/electron-builder/pull/7432) [`4d3fdfcf`](https://github.com/electron-userland/electron-builder/commit/4d3fdfcfe5c6b75cdb8fa8e89f6169c986949bcb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: report the correct status result when `doSign` exits early from macPackager and winPackager. Updated function definition to return `Promise<boolean>` to properly flag intellisense

- [#7213](https://github.com/electron-userland/electron-builder/pull/7213) [`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides

- [#7297](https://github.com/electron-userland/electron-builder/pull/7297) [`9ce74482`](https://github.com/electron-userland/electron-builder/commit/9ce74482ef0f4abc1206dc96dca559eb9f03d50c) Thanks [@t3chguy](https://github.com/t3chguy)! - fix(app-builder-lib): export missing TS types

- [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

- [#7327](https://github.com/electron-userland/electron-builder/pull/7327) [`973a0048`](https://github.com/electron-userland/electron-builder/commit/973a0048b46b8367864241a903453f927c158304) Thanks [@gbodeen](https://github.com/gbodeen)! - fix: Ensure parent directories of symlinks are created when copied directory only contains symlinks

- [#7352](https://github.com/electron-userland/electron-builder/pull/7352) [`c08db0a9`](https://github.com/electron-userland/electron-builder/commit/c08db0a92b5e251229a424c1c00559086d860dde) Thanks [@michaelwbarry](https://github.com/michaelwbarry)! - fix: re-add `--identifier` to mac pkg build to address issue #7348

- Updated dependencies [[`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa), [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98), [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577), [`4d3fdfcf`](https://github.com/electron-userland/electron-builder/commit/4d3fdfcfe5c6b75cdb8fa8e89f6169c986949bcb), [`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0), [`c21e3b37`](https://github.com/electron-userland/electron-builder/commit/c21e3b37e0dd064c12dbd38065a548441d7c5a9e), [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)]:
  - builder-util-runtime@9.2.0
  - builder-util@24.0.0
  - electron-publish@24.0.0

## 24.0.0-alpha.13

### Patch Changes

- [#7432](https://github.com/electron-userland/electron-builder/pull/7432) [`4d3fdfcf`](https://github.com/electron-userland/electron-builder/commit/4d3fdfcfe5c6b75cdb8fa8e89f6169c986949bcb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: report the correct status result when `doSign` exits early from macPackager and winPackager. Updated function definition to return `Promise<boolean>` to properly flag intellisense

- Updated dependencies [[`4d3fdfcf`](https://github.com/electron-userland/electron-builder/commit/4d3fdfcfe5c6b75cdb8fa8e89f6169c986949bcb)]:
  - builder-util@24.0.0-alpha.13
  - electron-publish@24.0.0-alpha.13

## 24.0.0-alpha.12

### Patch Changes

- [`45c07e3e`](https://github.com/electron-userland/electron-builder/commit/45c07e3e063e89a6f8a82e8ae5ef7a2453ff161a) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: enable signing of .node modules in order to support WDAC

- [#7407](https://github.com/electron-userland/electron-builder/pull/7407) [`a3387309`](https://github.com/electron-userland/electron-builder/commit/a3387309f0297cb824926bd7fa5cb653da9f24ca) Thanks [@ghost1face](https://github.com/ghost1face)! - feat: Allow for NSIS windows installer to be wrapped in an MSI

## 24.0.0-alpha.11

### Major Changes

- [#7388](https://github.com/electron-userland/electron-builder/pull/7388) [`1cb8f50c`](https://github.com/electron-userland/electron-builder/commit/1cb8f50c3551b398e20b798aba0c60bb34860b49) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(BREAKING): Execute `afterSign` hook only when signing is completed, otherwise skip

- [#7378](https://github.com/electron-userland/electron-builder/pull/7378) [`db69a187`](https://github.com/electron-userland/electron-builder/commit/db69a1875d219310b3050b35cdc46c20ec45cc04) Thanks [@filfreire](https://github.com/filfreire)! - Remove extra adapter field if core22 is set as base for snapcraft

### Minor Changes

- [#7373](https://github.com/electron-userland/electron-builder/pull/7373) [`9700c753`](https://github.com/electron-userland/electron-builder/commit/9700c75331e7d8de4efd257d8774b8c2a422538b) Thanks [@indutny-signal](https://github.com/indutny-signal)! - feat: optional vendor information in releaseInfo

### Patch Changes

- [#7382](https://github.com/electron-userland/electron-builder/pull/7382) [`bb376875`](https://github.com/electron-userland/electron-builder/commit/bb37687540aa254bce6a92a86c56b606cc16f2be) Thanks [@radex](https://github.com/radex)! - fix: Allow MAS builds to be unsigned if `identity: null` is explicitly passed

- [#7383](https://github.com/electron-userland/electron-builder/pull/7383) [`e5748b3d`](https://github.com/electron-userland/electron-builder/commit/e5748b3df35676cf6e411c6c47fc4fc56e0a26f2) Thanks [@radex](https://github.com/radex)! - fix: MAS builds should respect arch suffix per `defaultArch` config

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

- [#7387](https://github.com/electron-userland/electron-builder/pull/7387) [`aeffe080`](https://github.com/electron-userland/electron-builder/commit/aeffe080e07f11057134947e09021cd9d6712935) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: reset `GYP_MSVS_VERSION` for multi-arch builds before `beforePack`

- Updated dependencies [[`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98)]:
  - builder-util-runtime@9.2.0-alpha.3
  - builder-util@24.0.0-alpha.11
  - electron-publish@24.0.0-alpha.11

## 24.0.0-alpha.10

### Major Changes

- [#7361](https://github.com/electron-userland/electron-builder/pull/7361) [`f9f23bef`](https://github.com/electron-userland/electron-builder/commit/f9f23bef64efd429f6dfd1ec81f2d73927f63a8e) Thanks [@filfreire](https://github.com/filfreire)! - Remove spctl check from Mac notarization step

## 24.0.0-alpha.9

### Minor Changes

- [#7351](https://github.com/electron-userland/electron-builder/pull/7351) [`1e8dad8b`](https://github.com/electron-userland/electron-builder/commit/1e8dad8bc58f53780c9fac3b0c48e248a8b5467c) Thanks [@filfreire](https://github.com/filfreire)! - Update MacOS signOptions on macPackager

### Patch Changes

- [#7339](https://github.com/electron-userland/electron-builder/pull/7339) [`8f94978c`](https://github.com/electron-userland/electron-builder/commit/8f94978c41d63e9fb4aa70a1df67f25804fdaf84) Thanks [@zanzara](https://github.com/zanzara)! - fix: add missing html extension for multi language license files in nsis target

- [#7327](https://github.com/electron-userland/electron-builder/pull/7327) [`973a0048`](https://github.com/electron-userland/electron-builder/commit/973a0048b46b8367864241a903453f927c158304) Thanks [@gbodeen](https://github.com/gbodeen)! - fix: Ensure parent directories of symlinks are created when copied directory only contains symlinks

- [#7352](https://github.com/electron-userland/electron-builder/pull/7352) [`c08db0a9`](https://github.com/electron-userland/electron-builder/commit/c08db0a92b5e251229a424c1c00559086d860dde) Thanks [@michaelwbarry](https://github.com/michaelwbarry)! - fix: re-add `--identifier` to mac pkg build to address issue #7348

## 24.0.0-alpha.8

### Major Changes

- [#7320](https://github.com/electron-userland/electron-builder/pull/7320) [`2852cb56`](https://github.com/electron-userland/electron-builder/commit/2852cb56a337709f8b7f0bcbf92b034ec8a07e7f) Thanks [@filfreire](https://github.com/filfreire)! - Add base option for snapcraft

### Minor Changes

- [#7314](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa) Thanks [@lbestftr](https://github.com/lbestftr)! - added the accelerate option to handle accelerated s3 buckets

### Patch Changes

- Updated dependencies [[`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa)]:
  - builder-util-runtime@9.2.0-alpha.2
  - builder-util@24.0.0-alpha.8
  - electron-publish@24.0.0-alpha.8

## 24.0.0-alpha.7

### Minor Changes

- [#7310](https://github.com/electron-userland/electron-builder/pull/7310) [`00d0dbc2`](https://github.com/electron-userland/electron-builder/commit/00d0dbc2d74fbac3e9ce7a046427c1e1d9a11301) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: integrating @electron/notarize into mac signing flow

## 24.0.0-alpha.6

### Patch Changes

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- Updated dependencies [[`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577)]:
  - builder-util-runtime@9.1.2-alpha.1
  - builder-util@24.0.0-alpha.6
  - electron-publish@24.0.0-alpha.6

## 24.0.0-alpha.5

### Minor Changes

- [#7060](https://github.com/electron-userland/electron-builder/pull/7060) [`1d130012`](https://github.com/electron-userland/electron-builder/commit/1d130012737e77b57c8923fcc0e6ad2cbc5da0e8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Introducing deb and rpm auto-updates as beta feature

### Patch Changes

- [#7297](https://github.com/electron-userland/electron-builder/pull/7297) [`9ce74482`](https://github.com/electron-userland/electron-builder/commit/9ce74482ef0f4abc1206dc96dca559eb9f03d50c) Thanks [@t3chguy](https://github.com/t3chguy)! - fix(app-builder-lib): export missing TS types

## 24.0.0-alpha.4

### Minor Changes

- [#7251](https://github.com/electron-userland/electron-builder/pull/7251) [`45a0f82a`](https://github.com/electron-userland/electron-builder/commit/45a0f82ac3a14fedfb03880fb43d525a51cec864) Thanks [@ptol](https://github.com/ptol)! - feat(nsis): add ShutdownBlockReasonCreate for blocking Windowns Shutdown alert/prompt

### Patch Changes

- [#7275](https://github.com/electron-userland/electron-builder/pull/7275) [`5668dc20`](https://github.com/electron-userland/electron-builder/commit/5668dc204b83ae0c1edf79a4998f41292007d230) Thanks [@Mstrodl](https://github.com/Mstrodl)! - Fixes a bug where signtool might not be used in a windows VM

- Updated dependencies [[`c21e3b37`](https://github.com/electron-userland/electron-builder/commit/c21e3b37e0dd064c12dbd38065a548441d7c5a9e)]:
  - electron-publish@24.0.0-alpha.4

## 24.0.0-alpha.3

### Patch Changes

- [#7213](https://github.com/electron-userland/electron-builder/pull/7213) [`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides

- Updated dependencies [[`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0)]:
  - builder-util@24.0.0-alpha.3
  - electron-publish@24.0.0-alpha.3

## 24.0.0-alpha.2

### Patch Changes

- [#7215](https://github.com/electron-userland/electron-builder/pull/7215) [`0d3b87f7`](https://github.com/electron-userland/electron-builder/commit/0d3b87f7b89eb2e8f43613acec0e7e057bca88ab) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Using electron-rebuild for finding project root for native node addons to correctly handle monorepo setups

* [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

* Updated dependencies [[`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)]:
  - builder-util-runtime@9.1.2-alpha.0
  - builder-util@24.0.0-alpha.2
  - electron-publish@24.0.0-alpha.2

## 24.0.0-alpha.1

### Patch Changes

- [#7174](https://github.com/electron-userland/electron-builder/pull/7174) [`0f9865dc`](https://github.com/electron-userland/electron-builder/commit/0f9865dc0775f9d80d3bd64cf3e2131be3ae9acb) Thanks [@faern](https://github.com/faern)! - Allow non-semver version formats on Windows

## 24.0.0-alpha.0

### Major Changes

- [#7198](https://github.com/electron-userland/electron-builder/pull/7198) [`a2ce9a77`](https://github.com/electron-userland/electron-builder/commit/a2ce9a77c04868e9c01ad76b10955499f1f42eb3) Thanks [@fangpenlin](https://github.com/fangpenlin)! - Extending `linux` executableArgs option to be utilized for Snap target

* [#7196](https://github.com/electron-userland/electron-builder/pull/7196) [`5616f23c`](https://github.com/electron-userland/electron-builder/commit/5616f23ce3d03a4e71c7b7bd515ec958b1631b8b) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Migrate to electron-rebuild for handling native dependencies

### Minor Changes

- [#7180](https://github.com/electron-userland/electron-builder/pull/7180) [`edb28c09`](https://github.com/electron-userland/electron-builder/commit/edb28c093ab251470e9f1579cd58b4f2ed89e21d) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: enabling typescript config files (i.e. electron-builder.ts)

### Patch Changes

- [#7188](https://github.com/electron-userland/electron-builder/pull/7188) [`3816d4f3`](https://github.com/electron-userland/electron-builder/commit/3816d4f30371345def83a0667d67648790259605) Thanks [@taratatach](https://github.com/taratatach)! - docs: Warn users not to disable zip for macos if using auto-update

## 23.6.0

### Minor Changes

- [#7141](https://github.com/electron-userland/electron-builder/pull/7141) [`d71a5790`](https://github.com/electron-userland/electron-builder/commit/d71a5790a94cd56b6e033b656b4892ec31f14b9d) Thanks [@moulinierf](https://github.com/moulinierf)! - feat: add nsis option to remove the default uninstall welcome page

### Patch Changes

- [#7142](https://github.com/electron-userland/electron-builder/pull/7142) [`9338097a`](https://github.com/electron-userland/electron-builder/commit/9338097a9f6754dee8d87185154eaa7d9cffdec8) Thanks [@hrueger](https://github.com/hrueger)! - fix: formatting of Code in the MacOS PKG docs

- Updated dependencies [[`4583273e`](https://github.com/electron-userland/electron-builder/commit/4583273ebe5cabfd1c14f647dc9edb7bff3c3bf3)]:
  - builder-util@23.6.0
  - electron-publish@23.6.0

## 23.5.1

### Patch Changes

- [#7110](https://github.com/electron-userland/electron-builder/pull/7110) [`0a7025e5`](https://github.com/electron-userland/electron-builder/commit/0a7025e5184e3333d077db1f7e782d6a768ecdea) Thanks [@MikeJerred](https://github.com/MikeJerred)! - fix: strip extra fields out that are not allowed when creating snap.yaml (#7104)

* [#7120](https://github.com/electron-userland/electron-builder/pull/7120) [`740c4114`](https://github.com/electron-userland/electron-builder/commit/740c41146f875feaa730d18f8353b11416dab1e0) Thanks [@cjeonguk](https://github.com/cjeonguk)! - fix(docs): typo of docs/generated/NsisOptions.md.

- [#7119](https://github.com/electron-userland/electron-builder/pull/7119) [`323618f7`](https://github.com/electron-userland/electron-builder/commit/323618f79108a8bb829dc1e84e933ace90940010) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: allow CSC_LINK to have a mime-type prefix that is stripped when converting it to a p12 for signing

## 23.5.0

### Minor Changes

- [#7075](https://github.com/electron-userland/electron-builder/pull/7075) [`8166267d`](https://github.com/electron-userland/electron-builder/commit/8166267d487cd26b154e28cf60d89102a487a353) Thanks [@davej](https://github.com/davej)! - Allow explicit `buildNumber` in config. `buildNumber` will take precedence over any environment variables (#6945)

### Patch Changes

- [#7097](https://github.com/electron-userland/electron-builder/pull/7097) [`e78a65c4`](https://github.com/electron-userland/electron-builder/commit/e78a65c46a55f794da2dd0d2f6e838f8421174b9) Thanks [@AxelTerizaki](https://github.com/AxelTerizaki)! - chore: Add documentation details to entitlement option for macOS configurations

* [#7089](https://github.com/electron-userland/electron-builder/pull/7089) [`a1d86fd7`](https://github.com/electron-userland/electron-builder/commit/a1d86fd75bbc7b252403c16966430a2e3562205d) Thanks [@jeanfbrito](https://github.com/jeanfbrito)! - fix: Swaps order of Apple certificate selection to fix publishing the MAS package on Mac Apple Store. (#7040)

* Updated dependencies [[`1023a93e`](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18), [`8166267d`](https://github.com/electron-userland/electron-builder/commit/8166267d487cd26b154e28cf60d89102a487a353)]:
  - builder-util-runtime@9.1.1
  - builder-util@23.5.0
  - electron-publish@23.5.0

## 23.4.0

### Minor Changes

- [#7028](https://github.com/electron-userland/electron-builder/pull/7028) [`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding timeout to publisher config for api requests and uploads

### Patch Changes

- Updated dependencies [[`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a)]:
  - builder-util-runtime@9.1.0
  - builder-util@23.4.0
  - electron-publish@23.4.0

## 23.3.3

### Patch Changes

- Updated dependencies [[`98d3a636`](https://github.com/electron-userland/electron-builder/commit/98d3a6361d500e85e443ee292529c27f0b4a0b59)]:
  - builder-util@23.3.3
  - electron-publish@23.3.3

## 23.3.2

### Patch Changes

- [#6996](https://github.com/electron-userland/electron-builder/pull/6996) [`53015253`](https://github.com/electron-userland/electron-builder/commit/53015253939f450468a6d8e0405697ea70c2a138) Thanks [@titus-anromedonn](https://github.com/titus-anromedonn)! - fix: Wrap the nsProcess.nsh include in a !ifndef in case it has already been imported in a custom install script

## 23.3.1

### Patch Changes

- [#6989](https://github.com/electron-userland/electron-builder/pull/6989) [`7ad5101b`](https://github.com/electron-userland/electron-builder/commit/7ad5101b4a72df411b76cc500a6a0dca85bf6540) Thanks [@ezekg](https://github.com/ezekg)! - Fix issue where, upon publishing a new release, electron-builder would attempt to create the same release for each artifact in parallel, resulting in conflict errors.

* [#6990](https://github.com/electron-userland/electron-builder/pull/6990) [`c3407a20`](https://github.com/electron-userland/electron-builder/commit/c3407a202d4dc1599b2cb90a7ff3d56e8e32309e) Thanks [@ezekg](https://github.com/ezekg)! - Fix release conflicts for Keygen publisher when releases share the same version across open/licensed products.

## 23.3.0

### Minor Changes

- [#6941](https://github.com/electron-userland/electron-builder/pull/6941) [`14503ceb`](https://github.com/electron-userland/electron-builder/commit/14503ceb99c1a31c54a261a1ae60a34980f36a50) Thanks [@ezekg](https://github.com/ezekg)! - Upgrade Keygen publisher/updater integration to API version v1.1.

### Patch Changes

- [#6964](https://github.com/electron-userland/electron-builder/pull/6964) [`b0e1b6f8`](https://github.com/electron-userland/electron-builder/commit/b0e1b6f8af95bc371c0bc91df65965f3f60f3a87) Thanks [@geovie](https://github.com/geovie)! - fix: nsis-web target set APP_PACKAGE_URL_IS_INCOMPLETE

* [#6970](https://github.com/electron-userland/electron-builder/pull/6970) [`28c07b43`](https://github.com/electron-userland/electron-builder/commit/28c07b4392161732ee221dbb3f3a3633899cfa33) Thanks [@csett86](https://github.com/csett86)! - fix(mas): Allow signing with "3rd Party Mac Developer Application"

- [#6960](https://github.com/electron-userland/electron-builder/pull/6960) [`6e90c845`](https://github.com/electron-userland/electron-builder/commit/6e90c8459111ec046b91f8ae5da1990af0bbe942) Thanks [@tkleinke](https://github.com/tkleinke)! - fix(nsis): fix typo in German installer message

* [#6961](https://github.com/electron-userland/electron-builder/pull/6961) [`4c867aa0`](https://github.com/electron-userland/electron-builder/commit/4c867aa017a7ce2bf88138634b6d1e9a3bf34854) Thanks [@aripollak](https://github.com/aripollak)! - fix: Optionally allow removing DISABLE_WAYLAND flag for snaps

- [#6956](https://github.com/electron-userland/electron-builder/pull/6956) [`4e905046`](https://github.com/electron-userland/electron-builder/commit/4e905046e632b396735b78618fbc01331448f088) Thanks [@regentcid434](https://github.com/regentcid434)! - fix(mac): allow Mac Developer certs for non Mac App Store builds

* [#6983](https://github.com/electron-userland/electron-builder/pull/6983) [`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: regenerate schema.json for `x64ArchFiles` in mac universal options

* Updated dependencies [[`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb), [`8ffd9d42`](https://github.com/electron-userland/electron-builder/commit/8ffd9d42d89634be76fd4554f659f2b2512f2081)]:
  - builder-util-runtime@9.0.3
  - builder-util@23.3.0
  - electron-publish@23.3.0

## 23.2.0

### Minor Changes

- [#6913](https://github.com/electron-userland/electron-builder/pull/6913) [`f3a56ef6`](https://github.com/electron-userland/electron-builder/commit/f3a56ef6f8132e0a7cc18ec58d1d6103683916dd) Thanks [@obra](https://github.com/obra)! - Expose electron/universal's new "x64ArchFiles" option to allow building universal binaries with single-architecture dependencies

### Patch Changes

- [#6909](https://github.com/electron-userland/electron-builder/pull/6909) [`0b6db59e`](https://github.com/electron-userland/electron-builder/commit/0b6db59ec10dfe05903f29d6790972f55746bef7) Thanks [@ezekg](https://github.com/ezekg)! - Pin Keygen publisher/updater integration to API version v1.0.

## 23.1.0

### Minor Changes

- [#6887](https://github.com/electron-userland/electron-builder/pull/6887) [`4d590d30`](https://github.com/electron-userland/electron-builder/commit/4d590d302f6c3baacf9dabf338904fef337960a6) Thanks [@schetle](https://github.com/schetle)! - add afterPack call after macOS universal package is created

### Patch Changes

- [#6878](https://github.com/electron-userland/electron-builder/pull/6878) [`2ece89a0`](https://github.com/electron-userland/electron-builder/commit/2ece89a08e7fb74a11ba3d0f5980b2a57c8b34ad) Thanks [@genezys](https://github.com/genezys)! - Fix MSI build target to support ampersands in the product name

* [#6892](https://github.com/electron-userland/electron-builder/pull/6892) [`5589eec7`](https://github.com/electron-userland/electron-builder/commit/5589eec797c2b2550e228ffaa7fb052ffde33947) Thanks [@KaminoRyo](https://github.com/KaminoRyo)! - docs: Improved CONTIRUBTING.md

- [#6827](https://github.com/electron-userland/electron-builder/pull/6827) [`fa72861f`](https://github.com/electron-userland/electron-builder/commit/fa72861f6cd2de97d191f1b2bbfddc6edf48ab6d) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(nsis): change strings, add translations

* [#6868](https://github.com/electron-userland/electron-builder/pull/6868) [`13b078af`](https://github.com/electron-userland/electron-builder/commit/13b078af8c567d05bbd4bb24db44f38388af4e92) Thanks [@KaminoRyo](https://github.com/KaminoRyo)! - refactor(nsis): make ambiguous types strict for nsis DEFINES

## 23.0.9

### Patch Changes

- [#6817](https://github.com/electron-userland/electron-builder/pull/6817) [`2860d132`](https://github.com/electron-userland/electron-builder/commit/2860d132fc837813627e6508e05b18ed5e5dedfc) Thanks [@rainbean](https://github.com/rainbean)! - fix: incompatible Windows sign tool in end user environment. Unify code logic to give end-user a chance to assign correct signtool.exe path with environment variable

- Updated dependencies [[`e9ba7500`](https://github.com/electron-userland/electron-builder/commit/e9ba75005dda39f03c04e37a5d46a1bbe634c189), [`9dc13ba2`](https://github.com/electron-userland/electron-builder/commit/9dc13ba2c1e7a852d3f743833f1bde17b62f1806), [`d3452b04`](https://github.com/electron-userland/electron-builder/commit/d3452b0427cb45035f6ed7f1266691db4accd5c4)]:
  - electron-publish@23.0.9
  - builder-util@23.0.9

## 23.0.8

### Patch Changes

- [#6813](https://github.com/electron-userland/electron-builder/pull/6813) [`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies and audit

- Updated dependencies [[`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43)]:
  - builder-util-runtime@9.0.2
  - builder-util@23.0.8
  - electron-publish@23.0.8

## 23.0.7

### Patch Changes

- [#6793](https://github.com/electron-userland/electron-builder/pull/6793) [`85a3e559`](https://github.com/electron-userland/electron-builder/commit/85a3e5595e64346514dd7f5fade42e3632a18ee0) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(nsis): cleanup temporary 7z folder before the last resort extraction. Fix last resort extraction exiting early.

* [#6787](https://github.com/electron-userland/electron-builder/pull/6787) [`eb456a87`](https://github.com/electron-userland/electron-builder/commit/eb456a87b0603dcc0e6d777c2b8e1c2e7b64d3a6) Thanks [@HwangTaehyun](https://github.com/HwangTaehyun)! - If window service needs to run installer for update, the installer must have admin previlege. Electron-updater detects whether elevating or not using isAdminRightsRequired in update-info.json. And this isAdminRightsRequired true option should be added to latest.yml using nsis's packElevateHelper option

- [#6791](https://github.com/electron-userland/electron-builder/pull/6791) [`95910f87`](https://github.com/electron-userland/electron-builder/commit/95910f87195f501eadda95c52cfa8e1816d211b6) Thanks [@devinbinnie](https://github.com/devinbinnie)! - feat: Use tar instead of 7zip to preserve file permissions in tar.gz packages

## 23.0.6

### Patch Changes

- [`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441) - chore: updating dependency tree

- Updated dependencies [[`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441)]:
  - builder-util@23.0.6
  - builder-util-runtime@9.0.1
  - electron-publish@23.0.6

## 23.0.5

### Patch Changes

- [#6775](https://github.com/electron-userland/electron-builder/pull/6775) [`e9a87a73`](https://github.com/electron-userland/electron-builder/commit/e9a87a738ceb2b9e14cbc85b4c62e11edab3d0cf) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(app-builder-lib): Overriding `additionalProperties` to allow electron-builder's schema validator to read `publish.requestHeaders`

## 23.0.4

### Patch Changes

- [#6772](https://github.com/electron-userland/electron-builder/pull/6772) [`e8613523`](https://github.com/electron-userland/electron-builder/commit/e86135236908961b1269708ca645a66c7ff19287) Thanks [@lowfront](https://github.com/lowfront)! - fix(app-builder-lib): change slash to backslash in NSIS's APP_PACKAGE_NAME

* [#6771](https://github.com/electron-userland/electron-builder/pull/6771) [`e6c2a629`](https://github.com/electron-userland/electron-builder/commit/e6c2a629839184d4f9d3fa99b580d8c96911ea65) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(nsis): specify full path to system's find

- [#6750](https://github.com/electron-userland/electron-builder/pull/6750) [`370f84bb`](https://github.com/electron-userland/electron-builder/commit/370f84bb2f32f28c374b63e1c795e4850f971274) Thanks [@bradrees](https://github.com/bradrees)! - fix (app-builder-lib): bump @electron/universal to 1.2.1

## 23.0.3

### Patch Changes

- [#6729](https://github.com/electron-userland/electron-builder/pull/6729) [`0a308469`](https://github.com/electron-userland/electron-builder/commit/0a308469f269dc5294f29f2c422d9936175c0880) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Change DEBUG_LOGGING env var for nsis installers as part of `customNsisBinary` config. Fixes #6715

## 23.0.2

### Patch Changes

- [#6682](https://github.com/electron-userland/electron-builder/pull/6682) [`e6312cb5`](https://github.com/electron-userland/electron-builder/commit/e6312cb54e5d957289d5c07b506491fcaea9e334) Thanks [@karliatto](https://github.com/karliatto)! - fix(signing): Include swiftshader in signing directories for windows

* [#6692](https://github.com/electron-userland/electron-builder/pull/6692) [`93181a78`](https://github.com/electron-userland/electron-builder/commit/93181a78f2893ea4929aea8878343336931b3a04) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(app-builder-lib): export missing TS types

* Updated dependencies [[`5ffbe1e2`](https://github.com/electron-userland/electron-builder/commit/5ffbe1e2994b95aaccdc36d05a876db2cb5b28a3)]:
  - builder-util@23.0.2
  - electron-publish@23.0.2

## 23.0.1

### Patch Changes

- [#6660](https://github.com/electron-userland/electron-builder/pull/6660) [`4c6d1546`](https://github.com/electron-userland/electron-builder/commit/4c6d1546d4942aa9d9a93b7309e8ed279f6378d2) Thanks [@mifi](https://github.com/mifi)! - Fix error thrown due to duplicated signing of user-defined binaries on mac when resolving relative path

## 23.0.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - BREAKING CHANGE: remove MSI option `iconId`

### Minor Changes

- [#6578](https://github.com/electron-userland/electron-builder/pull/6578) [`81132a85`](https://github.com/electron-userland/electron-builder/commit/81132a857b24bfdb01fc44eba75fc89fa2885545) Thanks [@indutny-signal](https://github.com/indutny-signal)! - feat: use `mergeASARs` API by @electron/universal

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(msi): support assisted installer for MSI target

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(msi): add fileAssociation support for MSI target

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(mac): ElectronAsarIntegrity in electron@15

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Default to LZO compression for snap packages.
  This greatly improves cold startup performance (https://snapcraft.io/blog/why-lzo-was-chosen-as-the-new-compression-method).
  LZO has already been adopted by most desktop-oriented snaps outside of the Electron realm.

  For the rare case where developers prefer a smaller file size (XZ) to vastly improved decompression performance (LZO), provided an option to override the default compression method.

  Consumers do not need to update their configuration unless they specifically want to stick to XZ compression.

### Patch Changes

- [#6625](https://github.com/electron-userland/electron-builder/pull/6625) [`c561af81`](https://github.com/electron-userland/electron-builder/commit/c561af810d5de52bec57709cbaebca2ac92c55fc) Thanks [@DanielMcAssey](https://github.com/DanielMcAssey)! - fix(packager): wait for event before starting an upload

* [#6551](https://github.com/electron-userland/electron-builder/pull/6551) [`7b2a5e1f`](https://github.com/electron-userland/electron-builder/commit/7b2a5e1f19921e9da4aaaea8c01c78740f29f9dd) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(nsis): use revertible rmdir on update

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(win): iconId sometimes containing invalid characters, and iconId config option being ignored.
  fix(msi): change the fallback value for generated MSI Ids to a unique string for the product.

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(msi): MSI fails to install when deployed machine-wide via GPO

- [#6547](https://github.com/electron-userland/electron-builder/pull/6547) [`bea51d6a`](https://github.com/electron-userland/electron-builder/commit/bea51d6a8bb828d9b34734908f13b667aa55b0e9) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(nsis): Prevent partial updates from happening

* [#6598](https://github.com/electron-userland/electron-builder/pull/6598) [`70c35176`](https://github.com/electron-userland/electron-builder/commit/70c35176e452ee3159196edabaf685337a09cb82) Thanks [@baparham](https://github.com/baparham)! - chore(app-builder-lib): update electron-osx-sign from 0.5.0 to 0.6.0

* Updated dependencies [[`39da9edd`](https://github.com/electron-userland/electron-builder/commit/39da9edd2df5c147ef2d868f022484a8b2e0466a), [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222), [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - electron-publish@23.0.0
  - builder-util@23.0.0
  - builder-util-runtime@9.0.0

## 23.0.0-alpha.4

### Patch Changes

- [#6625](https://github.com/electron-userland/electron-builder/pull/6625) [`c561af81`](https://github.com/electron-userland/electron-builder/commit/c561af810d5de52bec57709cbaebca2ac92c55fc) Thanks [@DanielMcAssey](https://github.com/DanielMcAssey)! - fix(packager): wait for event before starting an upload

## 23.0.0-alpha.3

### Patch Changes

- [#6598](https://github.com/electron-userland/electron-builder/pull/6598) [`70c35176`](https://github.com/electron-userland/electron-builder/commit/70c35176e452ee3159196edabaf685337a09cb82) Thanks [@baparham](https://github.com/baparham)! - chore(app-builder-lib): update electron-osx-sign from 0.5.0 to 0.6.0

## 23.0.0-alpha.2

### Minor Changes

- [#6578](https://github.com/electron-userland/electron-builder/pull/6578) [`81132a85`](https://github.com/electron-userland/electron-builder/commit/81132a857b24bfdb01fc44eba75fc89fa2885545) Thanks [@indutny-signal](https://github.com/indutny-signal)! - feat: use `mergeASARs` API by @electron/universal

## 23.0.0-alpha.1

### Patch Changes

- Updated dependencies [[`39da9edd`](https://github.com/electron-userland/electron-builder/commit/39da9edd2df5c147ef2d868f022484a8b2e0466a)]:
  - electron-publish@23.0.0-alpha.1

## 23.0.0-alpha.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - BREAKING CHANGE: remove MSI option `iconId`

### Minor Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(msi): support assisted installer for MSI target

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(msi): add fileAssociation support for MSI target

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - feat(mac): ElectronAsarIntegrity in electron@15

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Default to LZO compression for snap packages.
  This greatly improves cold startup performance (https://snapcraft.io/blog/why-lzo-was-chosen-as-the-new-compression-method).
  LZO has already been adopted by most desktop-oriented snaps outside of the Electron realm.

  For the rare case where developers prefer a smaller file size (XZ) to vastly improved decompression performance (LZO), provided an option to override the default compression method.

  Consumers do not need to update their configuration unless they specifically want to stick to XZ compression.

### Patch Changes

- [#6551](https://github.com/electron-userland/electron-builder/pull/6551) [`7b2a5e1f`](https://github.com/electron-userland/electron-builder/commit/7b2a5e1f19921e9da4aaaea8c01c78740f29f9dd) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(nsis): use revertible rmdir on update

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(win): iconId sometimes containing invalid characters, and iconId config option being ignored.
  fix(msi): change the fallback value for generated MSI Ids to a unique string for the product.

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(msi): MSI fails to install when deployed machine-wide via GPO

* [#6547](https://github.com/electron-userland/electron-builder/pull/6547) [`bea51d6a`](https://github.com/electron-userland/electron-builder/commit/bea51d6a8bb828d9b34734908f13b667aa55b0e9) Thanks [@indutny-signal](https://github.com/indutny-signal)! - fix(nsis): Prevent partial updates from happening

* Updated dependencies [[`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222), [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - builder-util@23.0.0-alpha.0
  - builder-util-runtime@9.0.0-alpha.0
  - electron-publish@23.0.0-alpha.0

## 22.14.13

### Patch Changes

- Updated dependencies [[`f7b38698`](https://github.com/electron-userland/electron-builder/commit/f7b386986ec30f7e4cd3e3f68e078a773940a51c)]:
  - builder-util@22.14.13
  - electron-publish@22.14.13

## 22.14.12

### Patch Changes

- Updated dependencies [[`344bb232`](https://github.com/electron-userland/electron-builder/commit/344bb232d71e608b881a04fc98dca0858e42ddfc)]:
  - electron-publish@22.14.12

## 22.14.11

### Patch Changes

- [#6472](https://github.com/electron-userland/electron-builder/pull/6472) [`e3d06afa`](https://github.com/electron-userland/electron-builder/commit/e3d06afae1236d44e4b6e670b453b260b1f74d84) Thanks [@I-Otsuki](https://github.com/I-Otsuki)! - fix(nsis): Ignore other users processes when installing for only current user
  Closes #6104

## 22.14.10

### Patch Changes

- [#6449](https://github.com/electron-userland/electron-builder/pull/6449) [`df7a4255`](https://github.com/electron-userland/electron-builder/commit/df7a4255d219aea7a1236fd5693f7c13460099ad) Thanks [@saadshahd](https://github.com/saadshahd)! - Enable channel alternation for github publishing provider.

## 22.14.9

### Patch Changes

- [#6450](https://github.com/electron-userland/electron-builder/pull/6450) [`661a6522`](https://github.com/electron-userland/electron-builder/commit/661a6522520e9ea59549cb7e18986fcfb58e873a) Thanks [@robertpatrick](https://github.com/robertpatrick)! - fix(nsis): fix per-machine installs to properly elevate during silent install/updates

## 22.14.8

### Patch Changes

- [#6447](https://github.com/electron-userland/electron-builder/pull/6447) [`d20bcf0c`](https://github.com/electron-userland/electron-builder/commit/d20bcf0cea4e4cb49aab08f820131a2d6b083a2c) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(nsis): downgrade nsis from v3.0.4.2 to v3.0.4.1 due to (#6334)

## 22.14.7

### Patch Changes

- Updated dependencies [[`04a84352`](https://github.com/electron-userland/electron-builder/commit/04a84352b2b3fbb3c54533a8428bfd103df0af21)]:
  - builder-util@22.14.7
  - electron-publish@22.14.7

## 22.14.6

### Patch Changes

- [#6384](https://github.com/electron-userland/electron-builder/pull/6384) [`5468c188`](https://github.com/electron-userland/electron-builder/commit/5468c188f30f65352ca651e1f5fa9f8915c48c6b) Thanks [@sohobloo](https://github.com/sohobloo)! - fix(linux): If linux executableArgs already contains one of the mutually exclusive(%f / %u / %F / %U) code，don't append %U.

* [#6402](https://github.com/electron-userland/electron-builder/pull/6402) [`f41d5f39`](https://github.com/electron-userland/electron-builder/commit/f41d5f397ade8f6199d56bb4275b05a0a0e65bca) Thanks [@zcbenz](https://github.com/zcbenz)! - fix: Since node-gyp >= 8.4.0, building modules for old versions of Electron requires passing --force-process-config due to them lacking a valid config.gypi in their headers.

  See also nodejs/node-gyp#2497.

- [#6400](https://github.com/electron-userland/electron-builder/pull/6400) [`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3) Thanks [@jbool24](https://github.com/jbool24)! - refactor: update Bitbucket publisher to have optional config options for Token and Username (Bitbucket Private Repos)

- Updated dependencies [[`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3)]:
  - builder-util-runtime@8.9.2
  - builder-util@22.14.6
  - electron-publish@22.14.6

## 22.14.5

### Patch Changes

- [#6333](https://github.com/electron-userland/electron-builder/pull/6333) [`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff) Thanks [@lutzroeder](https://github.com/lutzroeder)! - fix: SnapStoreOptions required properties (#6327)

- Updated dependencies [[`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff)]:
  - builder-util-runtime@8.9.1
  - builder-util@22.14.5
  - electron-publish@22.14.5

## 22.14.4

### Patch Changes

- [#6308](https://github.com/electron-userland/electron-builder/pull/6308) [`fce1a1fa`](https://github.com/electron-userland/electron-builder/commit/fce1a1fab66e3f5cd741a4cecc4af8377aea9dd8) Thanks [@sr258](https://github.com/sr258)! - The filename of the app icon in macOS is now always 'icon.icns' instead of a derivate of the product name. The reason for this change is that macOS doesn't display icons with non-ASCII characters in their names, which is quite possible in languages other than English.

* [#6287](https://github.com/electron-userland/electron-builder/pull/6287) [`10b47273`](https://github.com/electron-userland/electron-builder/commit/10b47273c32c32df17dfb910feb4a7704c83da91) Thanks [@nonesand](https://github.com/nonesand)! - fix: add appCannotBeClosed text for zh_CN

- [#6300](https://github.com/electron-userland/electron-builder/pull/6300) [`b7e4c382`](https://github.com/electron-userland/electron-builder/commit/b7e4c382984bac874f63b83e0db91d875566a550) Thanks [@indutny-signal](https://github.com/indutny-signal)! - chore(nsis): fix i18n of appCannotBeClosed

* [#6309](https://github.com/electron-userland/electron-builder/pull/6309) [`e29a6b8b`](https://github.com/electron-userland/electron-builder/commit/e29a6b8b36695a2ed9d2f9a57e4c1c74587d1b16) Thanks [@GCKPaulYang](https://github.com/GCKPaulYang)! - fix: update assistedMessages.yml

- [#6293](https://github.com/electron-userland/electron-builder/pull/6293) [`8ebfc962`](https://github.com/electron-userland/electron-builder/commit/8ebfc96276bffe0bc1ad394c5ae6843976e01709) Thanks [@sr258](https://github.com/sr258)! - Introduced env var to allow custom username for Bitbucket publish. This allows you to user a username different from the owner. No changes to interfaces or signatures that require changes in consumers.

## 22.14.3

### Patch Changes

- [#6247](https://github.com/electron-userland/electron-builder/pull/6247) [`a9ec90d5`](https://github.com/electron-userland/electron-builder/commit/a9ec90d539fdbb5786692629275b1a89bfd7aec4) Thanks [@erikrz](https://github.com/erikrz)! - fix (msi): broken shortcut icon for desktop and startup entry (#5965)

* [#6277](https://github.com/electron-userland/electron-builder/pull/6277) [`b83d4ea7`](https://github.com/electron-userland/electron-builder/commit/b83d4ea778893f692c0405670a774d645602f063) Thanks [@indutny-signal](https://github.com/indutny-signal)! - chore(nsis): internationalize appCannotBeClosed

## 22.14.2

### Patch Changes

- [#6248](https://github.com/electron-userland/electron-builder/pull/6248) [`f3590355`](https://github.com/electron-userland/electron-builder/commit/f3590355c61dab05a6c92c5951aae8e59503d693) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: dmg-license as an optional dependency while still enabling docs site to build properly

## 22.14.1

### Patch Changes

- [#6244](https://github.com/electron-userland/electron-builder/pull/6244) [`8ccb2da5`](https://github.com/electron-userland/electron-builder/commit/8ccb2da5d4c641b971f6a7403d3b2e3a3b844a05) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: dmg-license optional dependency

## 22.14.0

### Minor Changes

- [#6228](https://github.com/electron-userland/electron-builder/pull/6228) [`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: adding Bitbucket publisher and autoupdater

### Patch Changes

- Updated dependencies [[`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8)]:
  - builder-util-runtime@8.9.0
  - builder-util@22.14.0
  - electron-publish@22.14.0

## 22.13.1

### Patch Changes

- [#6185](https://github.com/electron-userland/electron-builder/pull/6185) [`f6a30535`](https://github.com/electron-userland/electron-builder/commit/f6a3053563bd50dc77010d2910086c81acdf613e) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Support Windows 11 in VMs

* [#6193](https://github.com/electron-userland/electron-builder/pull/6193) [`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: adding snapStore to AllPublishOptions so that it properly is generated via `pnpm generate-schema`

* Updated dependencies [[`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e)]:
  - builder-util-runtime@8.8.1
  - builder-util@22.13.1
  - electron-publish@22.13.1

## 22.13.0

### Minor Changes

- [#6176](https://github.com/electron-userland/electron-builder/pull/6176) [`6f42f646`](https://github.com/electron-userland/electron-builder/commit/6f42f646c9d36405c9d69ca45dda51baabdec4bd) Thanks [@gaodeng](https://github.com/gaodeng)! - feat: add `beforePack` hook to build process with the same payload interface as that of `afterPack`

* [#6167](https://github.com/electron-userland/electron-builder/pull/6167) [`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding Keygen as an official publisher/updater for electron-builder (#6167)

### Patch Changes

- Updated dependencies [[`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f)]:
  - builder-util@22.13.0
  - builder-util-runtime@8.8.0
  - electron-publish@22.13.0

## 22.12.1

### Patch Changes

- c02ccbb9: fix: replace deprecated `--cache-min` option and use `--prefer-offline`
- Updated dependencies [6c945bd5]
  - builder-util@22.12.1
  - electron-publish@22.12.1

## 22.12.0

### Minor Changes

- 14974114: feat(nsis portable): Adding support for unique dir on each portable app launch
- a99a7c87: feat: allowing custom makensis url to be specified and adding flag to enable debug logging for NSIS scripts

## 22.11.11

### Patch Changes

- a4eae34f: Synchronizing CLI and package.json versions. Updating auto-publish values + changeset generation to be more frictionless
- 4a177dc0: fix(mac): Adding Developer ID Application entry for development signing when building not a mas target. Fixes: #6094
  fix(mac): Removing 3rd Party Mac Developer Application certificate selector. Fixes: #6101
- Updated dependencies [a4eae34f]
  - builder-util@22.11.11
  - builder-util-runtime@8.7.10
  - electron-publish@22.11.11

## 22.11.10

### Patch Changes

- 72ffc250: fix: App file walker including all node modules when a `node_modules/___` glob pattern is specified in `files` config (#6045)
- 878671d0: Updating patch number as many deps were updated as parted of RenovateBot integration
- Updated dependencies [878671d0]
  - builder-util-runtime@8.7.9
  - builder-util@22.11.10
  - electron-publish@22.11.10

## 22.11.9

### Patch Changes

- 1272afc5: Initial introduction of changset config
- Updated dependencies [1272afc5]
  - builder-util@22.11.9
  - builder-util-runtime@8.7.8
  - electron-publish@22.11.9
