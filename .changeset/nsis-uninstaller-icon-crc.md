---
"app-builder-lib": patch
---

fix(nsis): apply the uninstaller icon patch when extracting the uninstaller without running the installer, verify the NSIS integrity check before shipping it, and use this extraction on every host (running the installer is now only a fallback)
