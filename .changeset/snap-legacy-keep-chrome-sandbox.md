---
"app-builder-lib": patch
---

fix(snap): stop deleting `chrome-sandbox` from the shared `linux-unpacked` dir when building a core18/core20/core22 template snap. The delete raced the other Linux targets, so a deb, rpm or AppImage built in the same run could ship without `chrome-sandbox` (no SUID sandbox fallback), and AppImage could fail with `ENOENT`. The snap still omits `chrome-sandbox`; the `mksquashfs` input list already filters it out.
