---
"app-builder-lib": patch
---

fix(nsis): ensure 64-bit registry view is explicitly set before reading InstallLocation in setInstallModePerAllUsers, preventing $INSTDIR from resolving to Program Files (x86) after upgrade on 64-bit systems; also fix ARM64 fallback install directory
