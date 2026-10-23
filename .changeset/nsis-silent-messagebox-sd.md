---
"app-builder-lib": patch
---

fix(nsis): a silent auto-update no longer hangs forever on an invisible dialog when the old version's uninstall fails. The uninstall-failure `MessageBox` (and the other silent-mode-reachable `MessageBox`es in the NSIS templates) now carry a `/SD IDOK` silent default, so in silent installs the dialog auto-selects OK and the installer exits with its failure exit code instead of blocking on a dialog nobody can see.
