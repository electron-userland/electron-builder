# electron-publish

## 23.6.0

### Patch Changes

- Updated dependencies [[`4583273e`](https://github.com/electron-userland/electron-builder/commit/4583273ebe5cabfd1c14f647dc9edb7bff3c3bf3)]:
  - builder-util@23.6.0

## 23.5.0

### Patch Changes

- Updated dependencies [[`1023a93e`](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18), [`8166267d`](https://github.com/electron-userland/electron-builder/commit/8166267d487cd26b154e28cf60d89102a487a353)]:
  - builder-util-runtime@9.1.1
  - builder-util@23.5.0

## 23.4.0

### Minor Changes

- [#7028](https://github.com/electron-userland/electron-builder/pull/7028) [`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding timeout to publisher config for api requests and uploads

### Patch Changes

- Updated dependencies [[`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a)]:
  - builder-util-runtime@9.1.0
  - builder-util@23.4.0

## 23.3.3

### Patch Changes

- Updated dependencies [[`98d3a636`](https://github.com/electron-userland/electron-builder/commit/98d3a6361d500e85e443ee292529c27f0b4a0b59)]:
  - builder-util@23.3.3

## 23.3.0

### Patch Changes

- [#6958](https://github.com/electron-userland/electron-builder/pull/6958) [`8ffd9d42`](https://github.com/electron-userland/electron-builder/commit/8ffd9d42d89634be76fd4554f659f2b2512f2081) Thanks [@CCInc](https://github.com/CCInc)! - fix: prevent infinite error looping of overwriteArtifact during github artifact uploads

- Updated dependencies [[`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb)]:
  - builder-util-runtime@9.0.3
  - builder-util@23.3.0

## 23.0.9

### Patch Changes

- [#6840](https://github.com/electron-userland/electron-builder/pull/6840) [`e9ba7500`](https://github.com/electron-userland/electron-builder/commit/e9ba75005dda39f03c04e37a5d46a1bbe634c189) Thanks [@adelphes](https://github.com/adelphes)! - fix: set github release name to match the app version

- Updated dependencies [[`9dc13ba2`](https://github.com/electron-userland/electron-builder/commit/9dc13ba2c1e7a852d3f743833f1bde17b62f1806), [`d3452b04`](https://github.com/electron-userland/electron-builder/commit/d3452b0427cb45035f6ed7f1266691db4accd5c4)]:
  - builder-util@23.0.9

## 23.0.8

### Patch Changes

- Updated dependencies [[`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43)]:
  - builder-util-runtime@9.0.2
  - builder-util@23.0.8

## 23.0.6

### Patch Changes

- [`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441) - chore: updating dependency tree

- Updated dependencies [[`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441)]:
  - builder-util@23.0.6
  - builder-util-runtime@9.0.1

## 23.0.2

### Patch Changes

- Updated dependencies [[`5ffbe1e2`](https://github.com/electron-userland/electron-builder/commit/5ffbe1e2994b95aaccdc36d05a876db2cb5b28a3)]:
  - builder-util@23.0.2

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

### Patch Changes

- [#6563](https://github.com/electron-userland/electron-builder/pull/6563) [`39da9edd`](https://github.com/electron-userland/electron-builder/commit/39da9edd2df5c147ef2d868f022484a8b2e0466a) Thanks [@baparham](https://github.com/baparham)! - fix(electron-publish): handle plain text description from github api HTTP_ERROR_422 to resolve socket hang ups

- Updated dependencies [[`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222), [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - builder-util@23.0.0
  - builder-util-runtime@9.0.0

## 23.0.0-alpha.1

### Patch Changes

- [#6563](https://github.com/electron-userland/electron-builder/pull/6563) [`39da9edd`](https://github.com/electron-userland/electron-builder/commit/39da9edd2df5c147ef2d868f022484a8b2e0466a) Thanks [@baparham](https://github.com/baparham)! - fix(electron-publish): handle plain text description from github api HTTP_ERROR_422 to resolve socket hang ups

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

### Patch Changes

- Updated dependencies [[`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222), [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - builder-util@23.0.0-alpha.0
  - builder-util-runtime@9.0.0-alpha.0

## 22.14.13

### Patch Changes

- Updated dependencies [[`f7b38698`](https://github.com/electron-userland/electron-builder/commit/f7b386986ec30f7e4cd3e3f68e078a773940a51c)]:
  - builder-util@22.14.13

## 22.14.12

### Patch Changes

- [#6516](https://github.com/electron-userland/electron-builder/pull/6516) [`344bb232`](https://github.com/electron-userland/electron-builder/commit/344bb232d71e608b881a04fc98dca0858e42ddfc) Thanks [@robertpatrick](https://github.com/robertpatrick)! - fix: Explicitly set the protocol to https on the request objects to allow publishing to work from behind a proxy server when the https_proxy environment variable is set.

## 22.14.7

### Patch Changes

- Updated dependencies [[`04a84352`](https://github.com/electron-userland/electron-builder/commit/04a84352b2b3fbb3c54533a8428bfd103df0af21)]:
  - builder-util@22.14.7

## 22.14.6

### Patch Changes

- Updated dependencies [[`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3)]:
  - builder-util-runtime@8.9.2
  - builder-util@22.14.6

## 22.14.5

### Patch Changes

- Updated dependencies [[`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff)]:
  - builder-util-runtime@8.9.1
  - builder-util@22.14.5

## 22.14.0

### Minor Changes

- [#6228](https://github.com/electron-userland/electron-builder/pull/6228) [`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: adding Bitbucket publisher and autoupdater

### Patch Changes

- Updated dependencies [[`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8)]:
  - builder-util-runtime@8.9.0
  - builder-util@22.14.0

## 22.13.1

### Patch Changes

- Updated dependencies [[`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e)]:
  - builder-util-runtime@8.8.1
  - builder-util@22.13.1

## 22.13.0

### Minor Changes

- [#6167](https://github.com/electron-userland/electron-builder/pull/6167) [`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding Keygen as an official publisher/updater for electron-builder (#6167)

### Patch Changes

- Updated dependencies [[`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f)]:
  - builder-util@22.13.0
  - builder-util-runtime@8.8.0

## 22.12.1

### Patch Changes

- Updated dependencies [6c945bd5]
  - builder-util@22.12.1

## 22.11.11

### Patch Changes

- a4eae34f: Synchronizing CLI and package.json versions. Updating auto-publish values + changeset generation to be more frictionless
- Updated dependencies [a4eae34f]
  - builder-util@22.11.11
  - builder-util-runtime@8.7.10

## 22.11.10

### Patch Changes

- 878671d0: Updating patch number as many deps were updated as parted of RenovateBot integration
- Updated dependencies [878671d0]
  - builder-util-runtime@8.7.9
  - builder-util@22.11.10

## 22.11.9

### Patch Changes

- 1272afc5: Initial introduction of changset config
- Updated dependencies [1272afc5]
  - builder-util@22.11.9
  - builder-util-runtime@8.7.8
