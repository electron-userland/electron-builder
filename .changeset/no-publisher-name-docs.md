---
"electron-updater": patch
---

docs(updater): `ERR_UPDATER_NO_PUBLISHER_NAME` is documented as what it is, an update config file that goes missing after a download read it (a packaged app without one fails the download, reading it), and `autoUpdater.publisherName` is named next to the `win.verifyUpdateCodeSignature: false` opt-out
