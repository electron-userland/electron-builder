---
"app-builder-lib": patch
---

fix: mask every `cscLink`, `cscInstallerLink` and `pkcs11KeyUri` (only the root `cscLink` was masked) and the user info and query parameter values of URLs anywhere in a value, in `builder-effective-config.yaml`, the debug log and the publish debug log; name a downloaded certificate link without its user info or query in its warning and in the error of a failed download; and fail an `https` certificate link with user info, which `fetch` refuses, with an `InvalidConfigurationError` that does not show the link, see https://www.electron.build/docs/migration/v27-build-changes#certificate-links-with-user-info-are-rejected
