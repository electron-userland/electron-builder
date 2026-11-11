---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(runtime): a failed download into a file (for example one stopped at its declared size) is reported once the file is closed, so electron-updater removes the partly written file with the pending update instead of leaving a `temp-*` file behind when the failure came before the file had been opened, or while it was still open on Windows
