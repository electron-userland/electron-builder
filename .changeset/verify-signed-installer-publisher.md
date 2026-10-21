---
"app-builder-lib": patch
---

fix(win): fail the build when the signed NSIS installer (or nsis-web stub) is not signed by a certificate matching the publisherName that electron-updater verifies updates against
