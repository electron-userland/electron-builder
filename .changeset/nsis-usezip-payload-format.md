---
"app-builder-lib": patch
---

fix(nsis): keep installer extraction in sync with the payload format when `useZip` is set (ignored with a warning for differential-aware builds and for `nsis-web`, which always use 7z), and only share an app package between targets (e.g. nsis + portable) whose packaging settings match
