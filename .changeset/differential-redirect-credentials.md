---
"electron-updater": patch
---

fix(updater): differential downloads made with single range requests no longer send credential headers such as `Authorization` to a redirect target on another origin, which made pre-signed S3 or R2 URLs reject the range requests and forced a full download
