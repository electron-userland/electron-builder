---
"app-builder-lib": patch
---

fix(nsis): the assisted installer and uninstaller drop the closing quote that an earlier installer kept in `InstallLocation`, so the install mode page no longer shows the previous installation as `(C:\Program Files\App")`
