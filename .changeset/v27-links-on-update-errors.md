---
"electron-updater": patch
"app-builder-lib": patch
---

fix: end the unsigned-manifest, invalid-signature and missing web-package checksum errors, the no-key warning, the warning for a full installer downloaded while `disableWebInstaller` is set to false (now logged once per updater instance), and the nsis-web package check aborts with a v27 migration link
