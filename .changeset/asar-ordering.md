---
"app-builder-lib": patch
---

fix(asar): `asar.ordering` is now honored — the documented option was typed but never applied to the archive electron-builder packs (it packs through `@electron/asar`'s stream API, which takes no ordering option). Listed files are packed first, in the order of the file (same line syntax as `@electron/asar`: optional leading `/` or `<count>:` prefix, blank lines ignored), directories keep their positions, everything else follows in its original order; coverage is logged.
