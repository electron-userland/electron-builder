---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(runtime): cancelling a download now aborts its HTTP request, so a cancelled update download (or blockmap download) no longer keeps transferring and writing to the download file in the background
