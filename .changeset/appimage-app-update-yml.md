---
"app-builder-lib": patch
---

fix(linux): AppImage only writes `app-update.yml` itself for a prepackaged app (afterPack already wrote the same file otherwise), and then first waits for the tar.*/zip/7z archive of that app directory, so those archives never pick up the file halfway
