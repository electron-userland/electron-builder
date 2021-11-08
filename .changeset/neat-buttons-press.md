---
"app-builder-lib": patch
---

fix: Since node-gyp >= 8.4.0, building modules for old versions of Electron requires passing --force-process-config due to them lacking a valid config.gypi in their headers.

See also nodejs/node-gyp#2497.
