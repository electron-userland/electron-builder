---
"electron-publish": patch
---

fix(publish): reject a DigitalOcean Spaces `name` that is not a bucket name or a `region` that is not a region slug (e.g. `nyc3`), since both become the endpoint host
