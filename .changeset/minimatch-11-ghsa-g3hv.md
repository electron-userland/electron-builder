---
"app-builder-lib": patch
---

Upgrade `minimatch` to `^11.0.1` and `@electron/asar` to `^4.3.2` (which moves to `minimatch` ^11.0.1 and `glob` ^14) to pick up the fix for GHSA-g3hv-75wg-m249. Also upgrade `ejs` (used for the MSI project templates) to `^7.0.2`, which no longer depends on `jake`, removing the `minimatch` 3 and 5 copies that `jake` and `filelist` brought in.
