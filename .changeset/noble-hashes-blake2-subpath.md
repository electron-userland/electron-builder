---
"app-builder-lib": patch
---

fix: import blake2b from `@noble/hashes/blake2.js`, which both @noble/hashes 1.x and 2.x export, so projects that override @noble/hashes to 2.x can load electron-builder again (blockmap checksums are unchanged)
