# app-builder-lib

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
