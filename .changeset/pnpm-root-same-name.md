---
"app-builder-lib": patch
---

fix(pnpm-collector): read the app's own package.json from its directory so an app named like one of its dependencies no longer loses production dependencies from the asar
