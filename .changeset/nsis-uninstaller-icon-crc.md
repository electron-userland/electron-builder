---
"app-builder-lib": patch
---

fix(nsis): apply the uninstaller icon patch when extracting the uninstaller from the installer on macOS, and verify the NSIS integrity check before shipping it (falls back to running the installer when the check fails)
