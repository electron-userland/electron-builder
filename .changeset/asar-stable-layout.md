---
"app-builder-lib": minor
---

feat(asar): experimental opt-in `asar.stableLayout` that keeps every packed file of `app.asar` at its offset in a previous release's archive (`stableLayout.previous`), placing new files and files that outgrew their slot into freed slots or after the previous content, with an optional per-file `growthMargin`. Adding, removing or growing a file then no longer shifts every later file's header offset, so a differential update stops re-downloading most of the asar header. Off by default; the default layout is unchanged. `asar.contentAlignment` now keeps `@electron/asar`'s de-duplicated files sharing one copy instead of writing each again
