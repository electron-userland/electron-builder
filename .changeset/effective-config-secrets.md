---
"app-builder-lib": patch
---

fix: mask every `cscLink`, `cscInstallerLink` and `pkcs11KeyUri` (only the root `cscLink` was masked) and the user info and query parameter values of URLs anywhere in a value, in `builder-effective-config.yaml`, the debug log and the publish debug log, and log a downloaded certificate link without its user info or query
