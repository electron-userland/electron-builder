# builder-util-runtime

## 9.4.0

### Minor Changes

- [#9211](https://github.com/electron-userland/electron-builder/pull/9211) [`7c7fd6ca`](https://github.com/electron-userland/electron-builder/commit/7c7fd6ca240eda72048835f754adac92c4ab4e8c) Thanks [@FringeNet](https://github.com/FringeNet)! - fix: implement industry-standard cross-origin redirect auth handling

  Replace hardcoded service-specific hostname checks with sophisticated cross-origin redirect detection that matches industry standards from Python requests library and Apache HttpClient.

  **Key improvements:**

  - **Case-insensitive hostname comparison** for robust origin detection
  - **HTTP→HTTPS upgrade allowance** on standard ports (80→443) for backward compatibility
  - **Proper default port handling** that treats implicit and explicit default ports as equivalent
  - **Standards-compliant cross-origin detection** following RFC specifications

  **Fixes GitHub issue #9207:** GitHub release asset downloads failing with 403 Forbidden when redirected from `api.github.com` to `release-assets.githubusercontent.com` (Azure backend) or other cloud storage services that don't accept GitHub tokens.

  The implementation now handles all cross-origin redirect scenarios while maintaining compatibility with legitimate same-origin redirects and industry-standard HTTP→HTTPS upgrades.

### Patch Changes

- [#9216](https://github.com/electron-userland/electron-builder/pull/9216) [`44b28997`](https://github.com/electron-userland/electron-builder/commit/44b28997f15314730d1bb69303a47dc26f7950d1) Thanks [@taylorhadden](https://github.com/taylorhadden)! - feat(github): Add `tagNamePrefix` option and deprecate `vPrefixedTagName`

## 9.3.3

### Patch Changes

- [#9186](https://github.com/electron-userland/electron-builder/pull/9186) [`1a6ea016`](https://github.com/electron-userland/electron-builder/commit/1a6ea016b7793c75e7586e0e14d5f26d3535c292) Thanks [@daihere1993](https://github.com/daihere1993)! - feat(electron-updater): add GitLab provider support

- [#9177](https://github.com/electron-userland/electron-builder/pull/9177) [`35f5f6e5`](https://github.com/electron-userland/electron-builder/commit/35f5f6e55762ffc377fcd5587a8cea8753184d50) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: remove `shell: true` from node_modules collector so as to prevent shell console logging from malforming the json output

## 9.3.2

### Patch Changes

- [#9018](https://github.com/electron-userland/electron-builder/pull/9018) [`a2f7f735`](https://github.com/electron-userland/electron-builder/commit/a2f7f7350be2379c4917417c92ece5a6ab241708) Thanks [@gtluszcz](https://github.com/gtluszcz)! - Add information how to use electron-publish s3 with credentials stored in ~/.aws/config file.

## 9.3.1

### Patch Changes

- [#8815](https://github.com/electron-userland/electron-builder/pull/8815) [`8e7811d1`](https://github.com/electron-userland/electron-builder/commit/8e7811d18de3acb39ce9253cf2cd9afa4e23f99c) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: "organize imports" + change `ObjectMap` => `Record` for non-external properties (i.e. things that don't get processed for `scheme.json`)

- [#8813](https://github.com/electron-userland/electron-builder/pull/8813) [`07429661`](https://github.com/electron-userland/electron-builder/commit/07429661c0da2248cec5b92eb03390ae19266328) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: extract common `undefined | null` to reuse current (unexported) type `Nullish`. Expose `FileMatcher` instead of `@internal` flag

## 9.3.0

### Minor Changes

- [#8741](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1) Thanks [@0xlau](https://github.com/0xlau)! - Add `forcePathStyle` option to S3Options

- [#8711](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af) Thanks [@hrueger](https://github.com/hrueger)! - Add `host` property to support self-hosted Keygen instances

## 9.3.0-alpha.0

### Minor Changes

- [#8741](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1) Thanks [@0xlau](https://github.com/0xlau)! - Add `forcePathStyle` option to S3Options

- [#8711](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af) Thanks [@hrueger](https://github.com/hrueger)! - Add `host` property to support self-hosted Keygen instances

## 9.2.10

### Patch Changes

- [#8545](https://github.com/electron-userland/electron-builder/pull/8545) [`fc3a78e4e61f916058fca9b15fc16f076c3fabd1`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update devDependencies, including typescript

## 9.2.9

### Patch Changes

- [#8516](https://github.com/electron-userland/electron-builder/pull/8516) [`d1cb6bdb`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(chore): upgrading typescript and fixing compiler errors

## 9.2.8

### Patch Changes

- [#8491](https://github.com/electron-userland/electron-builder/pull/8491) [`178a3c40`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: migrating to typedoc and updating/improving type+interface definitions

## 9.2.7

### Patch Changes

- [#8486](https://github.com/electron-userland/electron-builder/pull/8486) [`d56cd274`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deploy): redeploy all packages to sync semver ranges

## 9.2.6

### Patch Changes

- [#8437](https://github.com/electron-userland/electron-builder/pull/8437) [`be625e06`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151) Thanks [@juwonjung-hdj](https://github.com/juwonjung-hdj)! - fix: retry renaming update file when EBUSY error occurs due to file lock

## 9.2.5

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8291](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48) Thanks [@IsaacAderogba](https://github.com/IsaacAderogba)! - fix: add MemoLazy to fix codeSigningInfo not responding to changed args

- [#8126](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(docs): update Bitbucket Options token doc

- [#8251](https://github.com/electron-userland/electron-builder/pull/8251) [`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89) Thanks [@m59peacemaker](https://github.com/m59peacemaker)! - Refactored to resolve circular dependency, eliminating warnings from tools such as Rollup

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

## 9.2.5-alpha.4

### Patch Changes

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8291](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48) Thanks [@IsaacAderogba](https://github.com/IsaacAderogba)! - fix: add MemoLazy to fix codeSigningInfo not responding to changed args

## 9.2.5-alpha.3

### Patch Changes

- [#8251](https://github.com/electron-userland/electron-builder/pull/8251) [`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89) Thanks [@m59peacemaker](https://github.com/m59peacemaker)! - Refactored to resolve circular dependency, eliminating warnings from tools such as Rollup

## 9.2.5-alpha.2

### Patch Changes

- [#8126](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(docs): update Bitbucket Options token doc

## 9.2.5-alpha.1

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

## 9.2.5-alpha.0

### Patch Changes

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

## 9.2.4

### Patch Changes

- [#8057](https://github.com/electron-userland/electron-builder/pull/8057) [`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: upgrading connected dependencies (typescript requires higher eslint version)

## 9.2.3

### Patch Changes

- [#7806](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f) Thanks [@AviVahl](https://github.com/AviVahl)! - fix: update @types/node for compat with newest @types/node

- [#7806](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f) Thanks [@AviVahl](https://github.com/AviVahl)! - fix: compat with newest @types/node

## 9.2.2

### Patch Changes

- [#7814](https://github.com/electron-userland/electron-builder/pull/7814) [`549d07b0`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a) Thanks [@jgresham](https://github.com/jgresham)! - minor addition to docs for snap publishing. add snapcraft link to local and cd auth options

## 9.2.1

### Patch Changes

- [#7544](https://github.com/electron-userland/electron-builder/pull/7544) [`dab3aeba`](https://github.com/electron-userland/electron-builder/commit/dab3aeba2240ead4300c8fdb35e3d9c16b04a23d) Thanks [@NoahAndrews](https://github.com/NoahAndrews)! - Fix differential downloads when the server compresses the blockmap file HTTP response

## 9.2.0

### Minor Changes

- [#7314](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa) Thanks [@lbestftr](https://github.com/lbestftr)! - added the accelerate option to handle accelerated s3 buckets

### Patch Changes

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

## 9.2.0-alpha.3

### Patch Changes

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

## 9.2.0-alpha.2

### Minor Changes

- [#7314](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa) Thanks [@lbestftr](https://github.com/lbestftr)! - added the accelerate option to handle accelerated s3 buckets

## 9.1.2-alpha.1

### Patch Changes

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

## 9.1.2-alpha.0

### Patch Changes

- [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

## 9.1.1

### Patch Changes

- [#7094](https://github.com/electron-userland/electron-builder/pull/7094) [`1023a93e`](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18) Thanks [@HppZ](https://github.com/HppZ)! - fix: close file stream when error

## 9.1.0

### Minor Changes

- [#7028](https://github.com/electron-userland/electron-builder/pull/7028) [`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding timeout to publisher config for api requests and uploads

## 9.0.3

### Patch Changes

- [#6983](https://github.com/electron-userland/electron-builder/pull/6983) [`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: regenerate schema.json for `x64ArchFiles` in mac universal options

## 9.0.2

### Patch Changes

- [#6813](https://github.com/electron-userland/electron-builder/pull/6813) [`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies and audit

## 9.0.1

### Patch Changes

- [`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441) - chore: updating dependency tree

## 9.0.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

## 9.0.0-alpha.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

## 8.9.2

### Patch Changes

- [#6400](https://github.com/electron-userland/electron-builder/pull/6400) [`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3) Thanks [@jbool24](https://github.com/jbool24)! - refactor: update Bitbucket publisher to have optional config options for Token and Username (Bitbucket Private Repos)

## 8.9.1

### Patch Changes

- [#6333](https://github.com/electron-userland/electron-builder/pull/6333) [`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff) Thanks [@lutzroeder](https://github.com/lutzroeder)! - fix: SnapStoreOptions required properties (#6327)

## 8.9.0

### Minor Changes

- [#6228](https://github.com/electron-userland/electron-builder/pull/6228) [`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: adding Bitbucket publisher and autoupdater

## 8.8.1

### Patch Changes

- [#6193](https://github.com/electron-userland/electron-builder/pull/6193) [`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: adding snapStore to AllPublishOptions so that it properly is generated via `pnpm generate-schema`

## 8.8.0

### Minor Changes

- [#6167](https://github.com/electron-userland/electron-builder/pull/6167) [`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding Keygen as an official publisher/updater for electron-builder (#6167)

## 8.7.10

### Patch Changes

- a4eae34f: Synchronizing CLI and package.json versions. Updating auto-publish values + changeset generation to be more frictionless

## 8.7.9

### Patch Changes

- 878671d0: Updating patch number as many deps were updated as parted of RenovateBot integration

## 8.7.8

### Patch Changes

- 1272afc5: Initial introduction of changset config
