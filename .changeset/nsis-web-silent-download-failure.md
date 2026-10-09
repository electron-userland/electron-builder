---
"app-builder-lib": patch
---

fix(nsis): a silent nsis-web installer run exits with code 2 when the app package cannot be downloaded, instead of waiting on the retry prompt. A cancelled package download, an app package that cannot be extracted, and a running app that cannot be closed (or that the user chose not to close) now also end an NSIS installer with exit code 2 explicitly, like its other aborts
