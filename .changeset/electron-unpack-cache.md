---
"app-builder-lib": patch
---

Add internal `electronUnpackCacheDir` packager option (test-only) that unzips the default Electron distribution once into a shared directory and copies it into each build instead of unzipping it again.
