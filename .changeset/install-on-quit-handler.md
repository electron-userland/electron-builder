---
"electron-updater": patch
---

fix(updater): the install on quit follows `autoInstallEvent` as it is when the app quits, also when it was `"manual"` while the update downloaded, and the updater logs why nothing is installed when the app quits before the update finished downloading and verifying, without installing an update cached by an earlier launch that `verifyUpdateFile` has not accepted yet
