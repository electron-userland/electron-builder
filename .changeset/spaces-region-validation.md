---
"electron-publish": patch
---

fix(publish): reject a DigitalOcean Spaces `region` that is not a region slug (e.g. `nyc3`), since it becomes the upload endpoint host
