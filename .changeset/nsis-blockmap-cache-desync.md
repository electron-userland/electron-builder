---
"electron-updater": patch
---

fix(nsis): don't plan a differential download against a cached block map of another release. The cached block map is replaced when a download finishes, but the cached installer only when the update is installed, so a release found before the previous one was installed was planned against the wrong base: every differential byte was downloaded, the sha512 check failed, and the full installer was downloaded too. A cached block map that does not end at the cached installer's size is now ignored and the installed version's block map is fetched from the server.
