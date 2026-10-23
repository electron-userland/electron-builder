---
"app-builder-lib": minor
---

feat(asar): `asar.contentAlignment` — align the start of every packed file's content inside `app.asar` to a multiple of N bytes (zero padding between files; order, sizes and per-file integrity unchanged). Meant for differential updates with `nsis.differentialPackage: "store-asar"`: the asar header stores absolute content offsets, so without alignment a change that grows a file by one byte shifts every later offset and most of the header is re-downloaded; with `512` a small length-changing edit measured 414 KB → 139 KB of differential download for 2.2 % more asar size. Off by default.
