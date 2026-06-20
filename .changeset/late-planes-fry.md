---
"app-builder-lib": patch
---

fix(win): flaky `appOutDir` mutation created `elevate.exe` race condition for concurrent builds that included Squirrel target
