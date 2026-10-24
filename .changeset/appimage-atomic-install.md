---
"electron-updater": patch
---

fix: installing an AppImage update no longer deletes the installed app before the new one is in place. Before, the updater deleted the running AppImage and then ran `mv` through `PATH`; if `mv` failed (for example `spawnSync mv ENOTCONN` when a dead AppImage FUSE mount from an earlier launch was on `PATH`), the user was left with no app to launch. After, the new AppImage is staged next to the old one and atomically renamed over it without running any external command, so a failed install keeps the old AppImage.
