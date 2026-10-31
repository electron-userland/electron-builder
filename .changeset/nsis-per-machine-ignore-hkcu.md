---
"app-builder-lib": major
---

fix(nsis)!: a per-machine installer no longer runs the uninstaller of a per-user installation or, where PowerShell is available, stops processes running from its directory, since both are named in the current user's registry and can be changed without administrator rights. Users moving from a per-user to a per-machine install remove the per-user copy themselves (Settings → Apps, or its uninstaller with `/S /currentuser`)
