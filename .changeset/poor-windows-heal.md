---
"app-builder-lib": patch
---

If window service needs to run installer for update, the installer must have admin previlege. Electron-updater detects whether elevating or not using isAdminRightsRequired in update-info.json. And this isAdminRightsRequired true option should be added to latest.yml using nsis's packElevateHelper option
