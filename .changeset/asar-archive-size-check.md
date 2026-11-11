---
"app-builder-lib": patch
---

fix: the `app.asar` sanity check now also compares the archive's size with the size its header describes. Before, an `app.asar` with extra or missing bytes passed as long as the entry file and `package.json` had a non-zero size in the header. After, an archive with extra bytes past what its header describes fails the build and names both byte counts. A header that describes more bytes than the file has (such as asarmor's default bloat patch, whose entries point far past the end of the file) only logs a warning, and the build goes on, unless the file has bytes after its last entry that fits in it. A truncated `app.asar` cut inside a file now fails for the same reason. With `asar.contentAlignment` set, the archive is also checked against its header before it is rewritten, so alignment refuses it instead of rewriting it.
