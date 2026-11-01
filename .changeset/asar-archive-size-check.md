---
"app-builder-lib": patch
---

fix: the `app.asar` sanity check now also compares the archive's size with the size its header describes, and hashes each packed file's content against the SHA256 its header records. Before, an `app.asar` with extra or missing bytes, or with bytes changed in place, passed as long as the entry file and `package.json` had a non-zero size in the header. After, the build fails and names both byte counts, or the file whose content does not match its hash. With `asar.contentAlignment` set, the archive's size is also checked against its header before it is rewritten, so alignment refuses it instead of rewriting it.
