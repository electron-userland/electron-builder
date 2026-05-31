---
"app-builder-lib": patch
---

fix(nsis): replace partial-match process detection with exact findstr /B match to stop false-positive "app cannot be closed" dialogs when a sibling process name contains the app name
