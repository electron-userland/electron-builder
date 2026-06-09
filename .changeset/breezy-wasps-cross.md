---
"electron-publish": patch
---

fix(publish): set x-amz-content-sha256: UNSIGNED-PAYLOAD before SigV4 signing so S3 accepts streaming PutObject uploads
