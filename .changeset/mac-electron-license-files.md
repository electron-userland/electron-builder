---
"app-builder-lib": patch
---

fix(mac): retain Electron's `LICENSE.electron.txt` and Chromium's `LICENSES.chromium.html` in the macOS `.app` bundle (`Contents/Resources`) instead of dropping them outside the bundle, matching the license files already shipped on Windows and Linux (#9407)
