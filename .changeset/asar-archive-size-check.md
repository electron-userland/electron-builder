---
"app-builder-lib": patch
---

fix: the `app.asar` sanity check now also compares the archive's size with the size its header describes. Before, an `app.asar` with extra or missing bytes passed as long as the entry file and `package.json` had a non-zero size in the header. After, the build fails and names both byte counts. With `asar.contentAlignment` set, the archive is also checked against its header before it is rewritten, so alignment refuses it instead of rewriting it.
