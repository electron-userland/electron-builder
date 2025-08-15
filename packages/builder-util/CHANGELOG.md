# builder-util

## 26.0.20

### Patch Changes

- [#9182](https://github.com/electron-userland/electron-builder/pull/9182) [`c54a0609`](https://github.com/electron-userland/electron-builder/commit/c54a0609753a11d032f87e727eccbab1f6836081) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: scrubbing more aggressively anything in the logs that MIGHT be password affiliated (handling spaces in secrets)

- Updated dependencies [[`44b28997`](https://github.com/electron-userland/electron-builder/commit/44b28997f15314730d1bb69303a47dc26f7950d1), [`7c7fd6ca`](https://github.com/electron-userland/electron-builder/commit/7c7fd6ca240eda72048835f754adac92c4ab4e8c)]:
  - builder-util-runtime@9.4.0

## 26.0.19

### Patch Changes

- [#9177](https://github.com/electron-userland/electron-builder/pull/9177) [`35f5f6e5`](https://github.com/electron-userland/electron-builder/commit/35f5f6e55762ffc377fcd5587a8cea8753184d50) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: remove `shell: true` from node_modules collector so as to prevent shell console logging from malforming the json output

- Updated dependencies [[`1a6ea016`](https://github.com/electron-userland/electron-builder/commit/1a6ea016b7793c75e7586e0e14d5f26d3535c292), [`35f5f6e5`](https://github.com/electron-userland/electron-builder/commit/35f5f6e55762ffc377fcd5587a8cea8753184d50)]:
  - builder-util-runtime@9.3.3

## 26.0.17

### Patch Changes

- [#9138](https://github.com/electron-userland/electron-builder/pull/9138) [`a6be444c`](https://github.com/electron-userland/electron-builder/commit/a6be444c90e59bbe92c53e94d7a5070f1399651f) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: wrapping Error in exec rejection so as to pass through error code to downstream logic

- [#9142](https://github.com/electron-userland/electron-builder/pull/9142) [`3128991a`](https://github.com/electron-userland/electron-builder/commit/3128991a1b0057e9a98903ff379022954da28135) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: adding additional docs to signAndEditExecutable for windows

## 26.0.16

### Patch Changes

- [#9117](https://github.com/electron-userland/electron-builder/pull/9117) [`b62737d8`](https://github.com/electron-userland/electron-builder/commit/b62737d8c4528c04c78a490cc4dca8cdadbeaaac) Thanks [@talentlessguy](https://github.com/talentlessguy)! - chore(deps): replace `is-ci` with `ci-info`

## 26.0.13

### Patch Changes

- [#8962](https://github.com/electron-userland/electron-builder/pull/8962) [`106640dd`](https://github.com/electron-userland/electron-builder/commit/106640dd42a3db08bfbe3a3a32fe333e93ba5c10) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(refactor): enable parallel packaging of archs and targets with `concurrency` config prop

- Updated dependencies [[`a2f7f735`](https://github.com/electron-userland/electron-builder/commit/a2f7f7350be2379c4917417c92ece5a6ab241708)]:
  - builder-util-runtime@9.3.2

## 26.0.11

### Patch Changes

- [#8919](https://github.com/electron-userland/electron-builder/pull/8919) [`53a81939`](https://github.com/electron-userland/electron-builder/commit/53a81939b8c46061027ab36d8f9114c35b250a7e) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(test): parallel test execution! Updates base Logger to squelch noisy/concurrent logging when VITEST env var and DEBUG=electron-builder are set.

## 26.0.7

### Patch Changes

- [#8869](https://github.com/electron-userland/electron-builder/pull/8869) [`c12f86f2`](https://github.com/electron-userland/electron-builder/commit/c12f86f2e254809e70d1f60d89cf9b7264278083) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: validate object key before deep assigning

## 26.0.4

### Patch Changes

- [#8839](https://github.com/electron-userland/electron-builder/pull/8839) [`8b059ad3`](https://github.com/electron-userland/electron-builder/commit/8b059ad3baad440acb0994b2c52f22ea0f1d987f) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: switch app-builder-bin to node-module-collector to get all production node modules

## 26.0.1

### Patch Changes

- [#8815](https://github.com/electron-userland/electron-builder/pull/8815) [`8e7811d1`](https://github.com/electron-userland/electron-builder/commit/8e7811d18de3acb39ce9253cf2cd9afa4e23f99c) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: "organize imports" + change `ObjectMap` => `Record` for non-external properties (i.e. things that don't get processed for `scheme.json`)

- [#8813](https://github.com/electron-userland/electron-builder/pull/8813) [`07429661`](https://github.com/electron-userland/electron-builder/commit/07429661c0da2248cec5b92eb03390ae19266328) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: extract common `undefined | null` to reuse current (unexported) type `Nullish`. Expose `FileMatcher` instead of `@internal` flag

- [#8810](https://github.com/electron-userland/electron-builder/pull/8810) [`62997b08`](https://github.com/electron-userland/electron-builder/commit/62997b087065650d263581fa17a2c0531039fcd9) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: migrate from BluebirdPromise to vanilla Promise. use `tiny-async-pool` for setting concurrency limit

- Updated dependencies [[`8e7811d1`](https://github.com/electron-userland/electron-builder/commit/8e7811d18de3acb39ce9253cf2cd9afa4e23f99c), [`07429661`](https://github.com/electron-userland/electron-builder/commit/07429661c0da2248cec5b92eb03390ae19266328)]:
  - builder-util-runtime@9.3.1

## 26.0.0

### Major Changes

- [#8562](https://github.com/electron-userland/electron-builder/pull/8562) [`b8185d48`](https://github.com/electron-userland/electron-builder/commit/b8185d48a75e65932196700e28bf71613dd141b4) Thanks [@beyondkmp](https://github.com/beyondkmp)! - support including node_modules in other subdirectories

### Minor Changes

- [#8741](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1) Thanks [@0xlau](https://github.com/0xlau)! - Add `forcePathStyle` option to S3Options

### Patch Changes

- [#8645](https://github.com/electron-userland/electron-builder/pull/8645) [`f4d40f91`](https://github.com/electron-userland/electron-builder/commit/f4d40f91f1511fc55cbef7c9e7edfddaf6ab67bc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: smart unpack for local module with dll

- [#8596](https://github.com/electron-userland/electron-builder/pull/8596) [`e0b0e351`](https://github.com/electron-userland/electron-builder/commit/e0b0e351baecc29e08d9f7d90f4699150b229416) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: refactor files for publishing to electron-publish

- [#8693](https://github.com/electron-userland/electron-builder/pull/8693) [`6a6bed46`](https://github.com/electron-userland/electron-builder/commit/6a6bed46c428b45105ada071a9cb89b5d4f93d9e) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency cross-spawn to v7.0.5 [security]

- [#8576](https://github.com/electron-userland/electron-builder/pull/8576) [`3eab7143`](https://github.com/electron-userland/electron-builder/commit/3eab7143d74262caace81ea05e97617d07daf336) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: packages in the workspace not being under node_modules

- [#8783](https://github.com/electron-userland/electron-builder/pull/8783) [`a5558e33`](https://github.com/electron-userland/electron-builder/commit/a5558e3380fdde4806c4c29694d4fe70fd11423a) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): upgrade cross spawn 7.0.6

- [#8604](https://github.com/electron-userland/electron-builder/pull/8604) [`d4ea0d99`](https://github.com/electron-userland/electron-builder/commit/d4ea0d998d0fb3ea3a75ca8d39a69a2f3c710962) Thanks [@beyondkmp](https://github.com/beyondkmp)! - chore(deps): update app-builder-bin to 5.0.0-alpha.11

- Updated dependencies [[`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1), [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)]:
  - builder-util-runtime@9.3.0

## 26.0.0-alpha.10

### Patch Changes

- [#8783](https://github.com/electron-userland/electron-builder/pull/8783) [`a5558e33`](https://github.com/electron-userland/electron-builder/commit/a5558e3380fdde4806c4c29694d4fe70fd11423a) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): upgrade cross spawn 7.0.6

## 26.0.0-alpha.8

### Minor Changes

- [#8741](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1) Thanks [@0xlau](https://github.com/0xlau)! - Add `forcePathStyle` option to S3Options

### Patch Changes

- Updated dependencies [[`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1), [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af)]:
  - builder-util-runtime@9.3.0-alpha.0

## 26.0.0-alpha.7

### Patch Changes

- [#8645](https://github.com/electron-userland/electron-builder/pull/8645) [`f4d40f91`](https://github.com/electron-userland/electron-builder/commit/f4d40f91f1511fc55cbef7c9e7edfddaf6ab67bc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: smart unpack for local module with dll

- [#8693](https://github.com/electron-userland/electron-builder/pull/8693) [`6a6bed46`](https://github.com/electron-userland/electron-builder/commit/6a6bed46c428b45105ada071a9cb89b5d4f93d9e) Thanks [@renovate](https://github.com/apps/renovate)! - fix(deps): update dependency cross-spawn to v7.0.5 [security]

## 26.0.0-alpha.3

### Patch Changes

- [#8596](https://github.com/electron-userland/electron-builder/pull/8596) [`e0b0e351`](https://github.com/electron-userland/electron-builder/commit/e0b0e351baecc29e08d9f7d90f4699150b229416) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: refactor files for publishing to electron-publish

- [#8604](https://github.com/electron-userland/electron-builder/pull/8604) [`d4ea0d99`](https://github.com/electron-userland/electron-builder/commit/d4ea0d998d0fb3ea3a75ca8d39a69a2f3c710962) Thanks [@beyondkmp](https://github.com/beyondkmp)! - chore(deps): update app-builder-bin to 5.0.0-alpha.11

## 26.0.0-alpha.1

### Patch Changes

- [#8576](https://github.com/electron-userland/electron-builder/pull/8576) [`3eab7143`](https://github.com/electron-userland/electron-builder/commit/3eab7143d74262caace81ea05e97617d07daf336) Thanks [@beyondkmp](https://github.com/beyondkmp)! - fix: packages in the workspace not being under node_modules

## 26.0.0-alpha.0

### Major Changes

- [#8562](https://github.com/electron-userland/electron-builder/pull/8562) [`b8185d48`](https://github.com/electron-userland/electron-builder/commit/b8185d48a75e65932196700e28bf71613dd141b4) Thanks [@beyondkmp](https://github.com/beyondkmp)! - support including node_modules in other subdirectories

## 25.1.7

### Patch Changes

- [#8545](https://github.com/electron-userland/electron-builder/pull/8545) [`fc3a78e4e61f916058fca9b15fc16f076c3fabd1`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update devDependencies, including typescript

- Updated dependencies [[`fc3a78e4e61f916058fca9b15fc16f076c3fabd1`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1)]:
  - builder-util-runtime@9.2.10

## 25.1.6

### Patch Changes

- [#8534](https://github.com/electron-userland/electron-builder/pull/8534) [`097eeced`](https://github.com/electron-userland/electron-builder/commit/097eeced3c82a3f19d7b80f2a23f1f7749b8af92) Thanks [@beyondkmp](https://github.com/beyondkmp)! - chore(deps): update dependency app-builder-bin to 5.0.0-alpha.10

## 25.1.5

### Patch Changes

- [#8516](https://github.com/electron-userland/electron-builder/pull/8516) [`d1cb6bdb`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(chore): upgrading typescript and fixing compiler errors

- Updated dependencies [[`d1cb6bdb`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338)]:
  - builder-util-runtime@9.2.9

## 25.1.4

### Patch Changes

- [#8476](https://github.com/electron-userland/electron-builder/pull/8476) [`4cacee4d`](https://github.com/electron-userland/electron-builder/commit/4cacee4d63ebfc9aacf156bd8b7faa80be1325dc) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency http-proxy-agent to v7

- [#8475](https://github.com/electron-userland/electron-builder/pull/8475) [`9ab4ff92`](https://github.com/electron-userland/electron-builder/commit/9ab4ff92c0ab441a9ca422f87fbed2f3544dde5e) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency https-proxy-agent to v7

## 25.1.3

### Patch Changes

- [#8491](https://github.com/electron-userland/electron-builder/pull/8491) [`178a3c40`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: migrating to typedoc and updating/improving type+interface definitions

- [#8489](https://github.com/electron-userland/electron-builder/pull/8489) [`5e21509a`](https://github.com/electron-userland/electron-builder/commit/5e21509a3f40d1a21f6f9ec9bf1d9d72c7149a21) Thanks [@beyondkmp](https://github.com/beyondkmp)! - chore(deps): update dependency app-builder-bin to 5.0.0-alpha.9

- Updated dependencies [[`178a3c40`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4)]:
  - builder-util-runtime@9.2.8

## 25.1.2

### Patch Changes

- [#8486](https://github.com/electron-userland/electron-builder/pull/8486) [`d56cd274`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deploy): redeploy all packages to sync semver ranges

- Updated dependencies [[`d56cd274`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744)]:
  - builder-util-runtime@9.2.7

## 25.1.0

### Patch Changes

- [#8478](https://github.com/electron-userland/electron-builder/pull/8478) [`27a8a60c`](https://github.com/electron-userland/electron-builder/commit/27a8a60c86adeaf792bbd0c33f3de23400ded2d4) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update dependency app-builder-bin to v5.0.0-alpha.8

## 25.0.6

### Patch Changes

- [#8437](https://github.com/electron-userland/electron-builder/pull/8437) [`be625e06`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151) Thanks [@juwonjung-hdj](https://github.com/juwonjung-hdj)! - fix: retry renaming update file when EBUSY error occurs due to file lock

- Updated dependencies [[`be625e06`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151)]:
  - builder-util-runtime@9.2.6

## 25.0.3

### Patch Changes

- [#8387](https://github.com/electron-userland/electron-builder/pull/8387) [`553c737b`](https://github.com/electron-userland/electron-builder/commit/553c737b2cf1ad835690f7db3c1907ae88944d15) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: upgrade app-builder-bin with downgraded appimage tool

## 25.0.2

### Patch Changes

- [#8375](https://github.com/electron-userland/electron-builder/pull/8375) [`54c1059b`](https://github.com/electron-userland/electron-builder/commit/54c1059b961f7c2a493d26b7e6ef674911069cad) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: checking cancellation token during pack and any retry tasks to exit early on process "cancel"

## 25.0.1

### Patch Changes

- [#8353](https://github.com/electron-userland/electron-builder/pull/8353) [`089dd639`](https://github.com/electron-userland/electron-builder/commit/089dd6396c9638910967c1968d9b8056acd952a9) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: updating app-builder dependency to resolve #8351

## 25.0.0

### Minor Changes

- [#8190](https://github.com/electron-userland/electron-builder/pull/8190) [`503da26f`](https://github.com/electron-userland/electron-builder/commit/503da26f1ef71bff19bd173bdce4052c48ddc5cc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: update app-builder-bin to 5.0-alpha release

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8135](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: unstable hdiutil retry mechanism

- [#8330](https://github.com/electron-userland/electron-builder/pull/8330) [`db1894d7`](https://github.com/electron-userland/electron-builder/commit/db1894d78a0bbf8377a787a25dddc17af22a4667) Thanks [@beyondkmp](https://github.com/beyondkmp)! - import builder-util from root instead of out

- [#8152](https://github.com/electron-userland/electron-builder/pull/8152) [`a999da48`](https://github.com/electron-userland/electron-builder/commit/a999da48480b5024d97c3028a655bb33b00fc3bc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - should not chmod for 7za when process.env.USE_SYSTEM_7ZA is true

- [#8274](https://github.com/electron-userland/electron-builder/pull/8274) [`88bbbdbe`](https://github.com/electron-userland/electron-builder/commit/88bbbdbe81936df1701f26138170e0f337c4f0d4) Thanks [@beyondkmp](https://github.com/beyondkmp)! - update app-builder to v5.0.0-alpha.4

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

- Updated dependencies [[`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf), [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28), [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48), [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41), [`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89), [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)]:
  - builder-util-runtime@9.2.5

## 25.0.0-alpha.13

### Patch Changes

- [#8330](https://github.com/electron-userland/electron-builder/pull/8330) [`db1894d7`](https://github.com/electron-userland/electron-builder/commit/db1894d78a0bbf8377a787a25dddc17af22a4667) Thanks [@beyondkmp](https://github.com/beyondkmp)! - import builder-util from root instead of out

## 25.0.0-alpha.12

### Patch Changes

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- Updated dependencies [[`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28), [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48)]:
  - builder-util-runtime@9.2.5-alpha.4

## 25.0.0-alpha.10

### Patch Changes

- [#8274](https://github.com/electron-userland/electron-builder/pull/8274) [`88bbbdbe`](https://github.com/electron-userland/electron-builder/commit/88bbbdbe81936df1701f26138170e0f337c4f0d4) Thanks [@beyondkmp](https://github.com/beyondkmp)! - update app-builder to v5.0.0-alpha.4

- Updated dependencies [[`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89)]:
  - builder-util-runtime@9.2.5-alpha.3

## 25.0.0-alpha.9

### Minor Changes

- [#8190](https://github.com/electron-userland/electron-builder/pull/8190) [`503da26f`](https://github.com/electron-userland/electron-builder/commit/503da26f1ef71bff19bd173bdce4052c48ddc5cc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: update app-builder-bin to 5.0-alpha release

## 25.0.0-alpha.6

### Patch Changes

- [#8152](https://github.com/electron-userland/electron-builder/pull/8152) [`a999da48`](https://github.com/electron-userland/electron-builder/commit/a999da48480b5024d97c3028a655bb33b00fc3bc) Thanks [@beyondkmp](https://github.com/beyondkmp)! - should not chmod for 7za when process.env.USE_SYSTEM_7ZA is true

## 25.0.0-alpha.4

### Patch Changes

- [#8135](https://github.com/electron-userland/electron-builder/pull/8135) [`c2392de7`](https://github.com/electron-userland/electron-builder/commit/c2392de71a8f7abc092a00452eac63dd24b34e88) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: unstable hdiutil retry mechanism

## 25.0.0-alpha.3

### Patch Changes

- Updated dependencies [[`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41)]:
  - builder-util-runtime@9.2.5-alpha.2

## 25.0.0-alpha.1

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

- Updated dependencies [[`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf)]:
  - builder-util-runtime@9.2.5-alpha.1

## 24.13.4-alpha.0

### Patch Changes

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

- Updated dependencies [[`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6)]:
  - builder-util-runtime@9.2.5-alpha.0

## 24.13.1

### Patch Changes

- [#8057](https://github.com/electron-userland/electron-builder/pull/8057) [`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: upgrading connected dependencies (typescript requires higher eslint version)

- Updated dependencies [[`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e)]:
  - builder-util-runtime@9.2.4

## 24.9.4

### Patch Changes

- [#7930](https://github.com/electron-userland/electron-builder/pull/7930) [`e4d6be81`](https://github.com/electron-userland/electron-builder/commit/e4d6be81d80ce9de0c95288d4418bbb80f7902af) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: consolidating usages of `7zip-bin` to builder-util-runtime so as to execute `chmod` logic _always_

## 24.8.1

### Patch Changes

- [#7806](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f) Thanks [@AviVahl](https://github.com/AviVahl)! - fix: update @types/node for compat with newest @types/node

- [#7829](https://github.com/electron-userland/electron-builder/pull/7829) [`1af7447e`](https://github.com/electron-userland/electron-builder/commit/1af7447edf47303de03ca2924727c78118161c60) Thanks [@lutzroeder](https://github.com/lutzroeder)! - fix(deps): Update 7zip-bin to support Windows on ARM

- [#7806](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f) Thanks [@AviVahl](https://github.com/AviVahl)! - fix: compat with newest @types/node

- Updated dependencies [[`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f), [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f)]:
  - builder-util-runtime@9.2.3

## 24.8.0

### Patch Changes

- Updated dependencies [[`549d07b0`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a)]:
  - builder-util-runtime@9.2.2

## 24.5.0

### Patch Changes

- [#7600](https://github.com/electron-userland/electron-builder/pull/7600) [`4dce3718`](https://github.com/electron-userland/electron-builder/commit/4dce3718abd75b8d0e29f37f6ba0ee1e76353c65) Thanks [@roryabraham](https://github.com/roryabraham)! - fix(mac): wrap hdiutil detach in retry w/ backoff

## 24.4.0

### Patch Changes

- [#7568](https://github.com/electron-userland/electron-builder/pull/7568) [`c9d20db9`](https://github.com/electron-userland/electron-builder/commit/c9d20db964cce991dab137ec0105d40d8eacd95c) Thanks [@t3chguy](https://github.com/t3chguy)! - Fix missing @types dependencies for output d.ts files

## 24.3.0

### Minor Changes

- [#7531](https://github.com/electron-userland/electron-builder/pull/7531) [`0db9c66f`](https://github.com/electron-userland/electron-builder/commit/0db9c66f0fff9a482d34aeaafaf11f542b786bf8) Thanks [@inickvel](https://github.com/inickvel)! - Display "Space required" text for NSIS installer

### Patch Changes

- Updated dependencies [[`dab3aeba`](https://github.com/electron-userland/electron-builder/commit/dab3aeba2240ead4300c8fdb35e3d9c16b04a23d)]:
  - builder-util-runtime@9.2.1

## 24.1.2

### Patch Changes

- [#7508](https://github.com/electron-userland/electron-builder/pull/7508) [`d4c90b67`](https://github.com/electron-userland/electron-builder/commit/d4c90b676aa22c745de4129f98453b97f264805c) Thanks [@NoahAndrews](https://github.com/NoahAndrews)! - Removed DefinitelyTyped dependencies from production dependencies list

## 24.1.0

### Patch Changes

- [#7466](https://github.com/electron-userland/electron-builder/pull/7466) [`1342f872`](https://github.com/electron-userland/electron-builder/commit/1342f872f98229cf6c31069253fcf0f435bfd9df) Thanks [@jkroepke](https://github.com/jkroepke)! - fix(arm64): use RPM architecture `aarch64` in name

## 24.0.0

### Patch Changes

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- [#7432](https://github.com/electron-userland/electron-builder/pull/7432) [`4d3fdfcf`](https://github.com/electron-userland/electron-builder/commit/4d3fdfcfe5c6b75cdb8fa8e89f6169c986949bcb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: report the correct status result when `doSign` exits early from macPackager and winPackager. Updated function definition to return `Promise<boolean>` to properly flag intellisense

- [#7213](https://github.com/electron-userland/electron-builder/pull/7213) [`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides

- [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

- Updated dependencies [[`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa), [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98), [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577), [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)]:
  - builder-util-runtime@9.2.0

## 24.0.0-alpha.13

### Patch Changes

- [#7432](https://github.com/electron-userland/electron-builder/pull/7432) [`4d3fdfcf`](https://github.com/electron-userland/electron-builder/commit/4d3fdfcfe5c6b75cdb8fa8e89f6169c986949bcb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: report the correct status result when `doSign` exits early from macPackager and winPackager. Updated function definition to return `Promise<boolean>` to properly flag intellisense

## 24.0.0-alpha.11

### Patch Changes

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

- Updated dependencies [[`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98)]:
  - builder-util-runtime@9.2.0-alpha.3

## 24.0.0-alpha.8

### Patch Changes

- Updated dependencies [[`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa)]:
  - builder-util-runtime@9.2.0-alpha.2

## 24.0.0-alpha.6

### Patch Changes

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- Updated dependencies [[`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577)]:
  - builder-util-runtime@9.1.2-alpha.1

## 24.0.0-alpha.3

### Patch Changes

- [#7213](https://github.com/electron-userland/electron-builder/pull/7213) [`17863671`](https://github.com/electron-userland/electron-builder/commit/1786367194272dff90e63d0a43f3ad5c3cc151f0) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): Updating dependencies and fixing `pnpm audit` with dependency overrides

## 24.0.0-alpha.2

### Patch Changes

- [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

- Updated dependencies [[`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d)]:
  - builder-util-runtime@9.1.2-alpha.0

## 23.6.0

### Patch Changes

- [#7152](https://github.com/electron-userland/electron-builder/pull/7152) [`4583273e`](https://github.com/electron-userland/electron-builder/commit/4583273ebe5cabfd1c14f647dc9edb7bff3c3bf3) Thanks [@kuidaoring](https://github.com/kuidaoring)! - feat: add Github Actions environment variable to isPullRequest method to detect if build is a PR

## 23.5.0

### Patch Changes

- [#7094](https://github.com/electron-userland/electron-builder/pull/7094) [`1023a93e`](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18) Thanks [@HppZ](https://github.com/HppZ)! - fix: close file stream when error

* [#7075](https://github.com/electron-userland/electron-builder/pull/7075) [`8166267d`](https://github.com/electron-userland/electron-builder/commit/8166267d487cd26b154e28cf60d89102a487a353) Thanks [@davej](https://github.com/davej)! - Allow explicit `buildNumber` in config. `buildNumber` will take precedence over any environment variables (#6945)

* Updated dependencies [[`1023a93e`](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18)]:
  - builder-util-runtime@9.1.1

## 23.4.0

### Minor Changes

- [#7028](https://github.com/electron-userland/electron-builder/pull/7028) [`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding timeout to publisher config for api requests and uploads

### Patch Changes

- Updated dependencies [[`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a)]:
  - builder-util-runtime@9.1.0

## 23.3.3

### Patch Changes

- [#7019](https://github.com/electron-userland/electron-builder/pull/7019) [`98d3a636`](https://github.com/electron-userland/electron-builder/commit/98d3a6361d500e85e443ee292529c27f0b4a0b59) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: Filter out duplicate values during deep assign of extra files by converting to Set first

## 23.3.0

### Patch Changes

- [#6983](https://github.com/electron-userland/electron-builder/pull/6983) [`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: regenerate schema.json for `x64ArchFiles` in mac universal options

- Updated dependencies [[`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb)]:
  - builder-util-runtime@9.0.3

## 23.0.9

### Patch Changes

- [#6841](https://github.com/electron-userland/electron-builder/pull/6841) [`9dc13ba2`](https://github.com/electron-userland/electron-builder/commit/9dc13ba2c1e7a852d3f743833f1bde17b62f1806) Thanks [@MrMYHuang](https://github.com/MrMYHuang)! - fix: Merge arrays from same config key in cascading electron-builder configs, such as `files`

* [#6845](https://github.com/electron-userland/electron-builder/pull/6845) [`d3452b04`](https://github.com/electron-userland/electron-builder/commit/d3452b0427cb45035f6ed7f1266691db4accd5c4) Thanks [@Jai-JAP](https://github.com/Jai-JAP)! - fix: Add "arm" as an alias for armv7l as process.arch outputs arm on armv7l hosts

## 23.0.8

### Patch Changes

- [#6813](https://github.com/electron-userland/electron-builder/pull/6813) [`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies and audit

- Updated dependencies [[`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43)]:
  - builder-util-runtime@9.0.2

## 23.0.6

### Patch Changes

- [`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441) - chore: updating dependency tree

- Updated dependencies [[`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441)]:
  - builder-util-runtime@9.0.1

## 23.0.2

### Patch Changes

- [#6684](https://github.com/electron-userland/electron-builder/pull/6684) [`5ffbe1e2`](https://github.com/electron-userland/electron-builder/commit/5ffbe1e2994b95aaccdc36d05a876db2cb5b28a3) Thanks [@mmaietta](https://github.com/mmaietta)! - Fix: Downgrading app-builder-bin in an attempt to resolve #6678

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

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Default to LZO compression for snap packages.
  This greatly improves cold startup performance (https://snapcraft.io/blog/why-lzo-was-chosen-as-the-new-compression-method).
  LZO has already been adopted by most desktop-oriented snaps outside of the Electron realm.

  For the rare case where developers prefer a smaller file size (XZ) to vastly improved decompression performance (LZO), provided an option to override the default compression method.

  Consumers do not need to update their configuration unless they specifically want to stick to XZ compression.

### Patch Changes

- Updated dependencies [[`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - builder-util-runtime@9.0.0

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

* [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Default to LZO compression for snap packages.
  This greatly improves cold startup performance (https://snapcraft.io/blog/why-lzo-was-chosen-as-the-new-compression-method).
  LZO has already been adopted by most desktop-oriented snaps outside of the Electron realm.

  For the rare case where developers prefer a smaller file size (XZ) to vastly improved decompression performance (LZO), provided an option to override the default compression method.

  Consumers do not need to update their configuration unless they specifically want to stick to XZ compression.

### Patch Changes

- Updated dependencies [[`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222)]:
  - builder-util-runtime@9.0.0-alpha.0

## 22.14.13

### Patch Changes

- [#6529](https://github.com/electron-userland/electron-builder/pull/6529) [`f7b38698`](https://github.com/electron-userland/electron-builder/commit/f7b386986ec30f7e4cd3e3f68e078a773940a51c) Thanks [@frankwang1101](https://github.com/frankwang1101)! - fix: use `junction` for symlink type when on Windows to solve Error: EPERM: operation not permitted

## 22.14.7

### Patch Changes

- [#6410](https://github.com/electron-userland/electron-builder/pull/6410) [`04a84352`](https://github.com/electron-userland/electron-builder/commit/04a84352b2b3fbb3c54533a8428bfd103df0af21) Thanks [@baparham](https://github.com/baparham)! - fix(builder-util): enable proxy handling in NodeHttpExecutor to fix requests/publishing behind corporate proxies

## 22.14.6

### Patch Changes

- [#6400](https://github.com/electron-userland/electron-builder/pull/6400) [`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3) Thanks [@jbool24](https://github.com/jbool24)! - refactor: update Bitbucket publisher to have optional config options for Token and Username (Bitbucket Private Repos)

- Updated dependencies [[`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3)]:
  - builder-util-runtime@8.9.2

## 22.14.5

### Patch Changes

- [#6333](https://github.com/electron-userland/electron-builder/pull/6333) [`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff) Thanks [@lutzroeder](https://github.com/lutzroeder)! - fix: SnapStoreOptions required properties (#6327)

- Updated dependencies [[`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff)]:
  - builder-util-runtime@8.9.1

## 22.14.0

### Minor Changes

- [#6228](https://github.com/electron-userland/electron-builder/pull/6228) [`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: adding Bitbucket publisher and autoupdater

### Patch Changes

- Updated dependencies [[`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8)]:
  - builder-util-runtime@8.9.0

## 22.13.1

### Patch Changes

- Updated dependencies [[`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e)]:
  - builder-util-runtime@8.8.1

## 22.13.0

### Minor Changes

- [#6167](https://github.com/electron-userland/electron-builder/pull/6167) [`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding Keygen as an official publisher/updater for electron-builder (#6167)

### Patch Changes

- Updated dependencies [[`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f)]:
  - builder-util-runtime@8.8.0

## 22.12.1

### Patch Changes

- 6c945bd5: fix(windows): detect node path correctly on windows with cross-spawn (#6069)

## 22.11.11

### Patch Changes

- a4eae34f: Synchronizing CLI and package.json versions. Updating auto-publish values + changeset generation to be more frictionless
- Updated dependencies [a4eae34f]
  - builder-util-runtime@8.7.10

## 22.11.10

### Patch Changes

- 878671d0: Updating patch number as many deps were updated as parted of RenovateBot integration
- Updated dependencies [878671d0]
  - builder-util-runtime@8.7.9

## 22.11.9

### Patch Changes

- 1272afc5: Initial introduction of changset config
- Updated dependencies [1272afc5]
  - builder-util-runtime@8.7.8
