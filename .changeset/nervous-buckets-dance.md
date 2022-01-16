---
"app-builder-lib": major
"builder-util": major
"builder-util-runtime": major
"electron-publish": major
"electron-updater": major
---

Breaking changes
Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
Force strip path separators for backslashes on Windows during update process
Force authentication for local mac squirrel update server

Fixes:
fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

Adding additional details to error console logging
