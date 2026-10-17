---
"electron-publish": patch
---

fix: restore S3 publishing with credentials from shared AWS config profiles, including cached IAM Identity Center sessions, when `AWS_SDK_LOAD_CONFIG=1`. Environment and shared-credentials-file keys keep precedence.
