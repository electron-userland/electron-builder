# app-builder-lib

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

* [#6193](https://github.com/electron-userland/electron-builder/pull/6193) [`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: adding snapStore to AllPublishOptions so that it properly is generated via `pnpm schema`

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
