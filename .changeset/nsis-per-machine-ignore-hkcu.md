---
"app-builder-lib": major
---

fix(nsis)!: a per-machine installer does not run the uninstaller of a per-user installation of the app or, where PowerShell is available, stop processes running from its directory. Users moving from a per-user to a per-machine install remove the per-user copy themselves (Settings → Apps, or its uninstaller with `/S /currentuser`)
