---
"app-builder-lib": patch
---

fix(win): with `win.sign: false` or `null`, no certificate is read from `CSC_LINK` / `WIN_CSC_LINK`, and app-update.yml carries no derived `publisherName`
