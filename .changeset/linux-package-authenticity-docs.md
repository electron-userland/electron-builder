---
"electron-updater": patch
---

fix: the apt install log no longer claims `allowUnverifiedLinuxPackages: false` verifies a downloaded `.deb`; apt checks no signature on a local `.deb` file, so it now warns instead
