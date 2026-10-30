---
"electron-updater": major
---

feat(updater)!: verify NSIS updates in a packaged app without `app-update.yml` against the new `NsisUpdater.publisherName` or a custom verifier, and reject them otherwise (`ERR_UPDATER_NO_PUBLISHER_NAME`)
