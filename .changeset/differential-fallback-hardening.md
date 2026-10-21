---
"electron-updater": patch
"builder-util-runtime": patch
---

fix(updater): download differentially when the update manifest has a hex-encoded sha512, never let a throwing logger stop a differential download or its fallback to a full download, time out stalled requests made with Electron's `net` module, and close the partially written file when a download's response fails or is aborted mid-body
