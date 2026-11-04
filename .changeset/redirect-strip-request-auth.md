---
"builder-util-runtime": patch
---

fix(runtime): a cross-origin redirect drops the request `auth` option together with the Authorization header, so Basic credentials go only to the original origin; with `DEBUG=electron-builder` a debug line names both origins. https://www.electron.build/docs/migration/v27-developer-changes#builder-util-runtime-cross-origin-headers
