---
"electron-updater": patch
---

fix(updater): on Linux (deb, rpm, pacman), a failed install on quit (e.g. the authentication dialog dismissed) cancels the quit and emits `error` instead of quitting without the update, and a quit while an update install runs waits for it to finish
