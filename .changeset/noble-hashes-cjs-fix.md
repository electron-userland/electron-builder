---
"app-builder-lib": patch
---

Fix `ERR_REQUIRE_ESM` when generating blockmaps on Node < 20.19 by pinning `@noble/hashes` to the dual CJS/ESM v1.8 and importing its `blake2b.js` entry.
