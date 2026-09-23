---
"app-builder-lib": patch
---

fix(nsis): preserve `$(...)` LangString references in escaped NSIS define values (e.g. `shortcutName: "$(customSN)"`)
