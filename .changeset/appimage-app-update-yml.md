---
"app-builder-lib": patch
---

fix(linux): AppImage waits for the tar.*/zip/7z archive of the same app directory and arch before writing `app-update.yml` into it, so those archives never pick up the file halfway (for a prepackaged app, this is its only `app-update.yml`)
