---
"app-builder-lib": patch
"electron-builder-squirrel-windows": patch
---

Dead code removal: delete ProtonFramework, LibUiFramework, and binDownload.ts; consolidate all binary downloads into `downloadBuilderToolset`.
