---
"app-builder-lib": patch
---

fix: Wrap the nsProcess.nsh include in a !ifndef in case it has already been imported in a custom install script
