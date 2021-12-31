---
"app-builder-lib": major
"builder-util": major
"builder-util-runtime": major
"electron-publish": major
"electron-updater": major
---

Breaking Changes:
Fail-fast for Windows signature verification failures. Adding `-LiteralPath` to update file for injected wildcards
Force strip path separators for backslashes on Windows
Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/

Fixes:
Adding INPUTxxx and OUTPUTxxx CHARSETS to makensis. Fixes: #4898 #6232 #6259
Force authentication for local Mac Squirrel update server

Adding additional details to error console logging
