---
"electron-updater": patch
---

fix: removing data from error being thrown. It's unnecessary and also unnecessarily large to be passing to the console. Resolves: #6131
