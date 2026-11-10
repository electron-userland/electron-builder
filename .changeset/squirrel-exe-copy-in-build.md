---
"electron-builder-squirrel-windows": patch
---

fix(squirrel): copy Squirrel.exe into the app directory in `build()`, with the execution stub, instead of from the queued installer work, so NSIS/AppX/MSIX never read the app directory while it is being written
