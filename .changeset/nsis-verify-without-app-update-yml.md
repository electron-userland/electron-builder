---
"electron-updater": major
---

feat(updater)!: verify NSIS updates in a packaged app whose update config file (`app-update.yml` or the `updateConfigPath` file) is missing against the new `NsisUpdater.publisherName`, and reject them otherwise without calling a custom verifier (`ERR_UPDATER_NO_PUBLISHER_NAME`)
