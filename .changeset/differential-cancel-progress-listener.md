---
"electron-updater": patch
---

fix(updater): settle a cancelled differential download with a `CancellationError` instead of hanging or falling back to a full download, and log a throwing `download-progress` listener instead of letting it break the download or keep progress from the other listeners
