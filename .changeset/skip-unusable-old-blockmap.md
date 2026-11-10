---
"electron-updater": patch
---

fix: download the full update, without a failed differential attempt, when the installed version's blockmap URL is the update's own (artifact name without version) or the downloaded old blockmap does not describe the cached installer
