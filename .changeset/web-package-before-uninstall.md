---
"app-builder-lib": patch
---

fix(nsis): the nsis-web installer copies, verifies and, if needed, downloads its app package before it removes the installed version, so a refused package, a local package that cannot be copied, or a failed or cancelled download leaves the installed version in place
