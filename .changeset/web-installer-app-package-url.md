---
"app-builder-lib": patch
---

Extract the nsis-web `APP_PACKAGE_URL` define resolution into an internal `configureWebInstallerAppPackageUrl` helper (no behaviour change) so it can be unit-tested without packaging.
