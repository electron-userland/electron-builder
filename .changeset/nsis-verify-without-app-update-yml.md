---
"electron-updater": minor
---

feat(updater): add `NsisUpdater.publisherName` (`autoUpdater.publisherName`, default `null`), the subject(s) of the certificate that signs your updates, to verify an NSIS update against when the update config has no `publisherName`. The `publisherName` of `app-update.yml` wins over it, and it wins over `verifyUpdateCodeSignature: false`. A packaged app whose update config file is missing when an update is verified rejects the update without it (`ERR_UPDATER_NO_PUBLISHER_NAME`), and a custom verifier is never called without a `publisherName`
