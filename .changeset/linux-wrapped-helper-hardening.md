---
"electron-updater": patch
---

fix(updater): with gksudo, kdesudo or beesu, run the package manager by its absolute path in the system directories and in a clean environment (`env -i`, PATH of system directories only), like pkexec and sudo
