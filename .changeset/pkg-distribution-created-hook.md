---
"app-builder-lib": minor
---

feat(mac): add a `pkgDistributionCreated` hook (#10355), mirroring `appxManifestCreated` and `msiProjectCreated`. It is called with the path to the PKG target's `distribution.xml` after electron-builder has written it and before `productbuild` builds the installer from it, so the distribution (for example, its `<title>`) can be edited in place or replaced.
