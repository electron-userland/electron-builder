---
"electron-updater": patch
---

fix(updater): the `ERR_UPDATER_INVALID_SIGNATURE` error for an `app-update.yml` without `publisherName` says how to configure one (sign the build or set `win.sign.publisherName`) and that `win.verifyUpdateCodeSignature: false` is the opt-out, with a link to the migration guide.
