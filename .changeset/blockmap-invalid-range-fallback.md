---
"electron-updater": patch
---

fix(updater): reject a differential download plan with empty, negative or fractional ranges (from a malformed blockmap) before any request, so it falls back to a full download; a copy of a range the old file cannot be read with fails the download with an error
