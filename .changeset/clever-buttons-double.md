---
"app-builder-lib": patch
---

fix: removes dynamic eval and utilizes a js helper file for trying `await import` and `require` that is then copied into the final npm package
