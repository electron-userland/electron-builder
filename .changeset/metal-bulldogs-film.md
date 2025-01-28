---
"app-builder-lib": patch
"builder-util": patch
"builder-util-runtime": patch
"dmg-builder": patch
---

chore: extract common `undefined | null` to reuse current (unexported) type `Nullish`. Expose `FileMatcher` instead of `@internal` flag
