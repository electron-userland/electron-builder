---
"electron-updater": patch
---

Remove the `lodash.isequal` dependency: the in-memory check for an already downloaded update compares the update info with `util.isDeepStrictEqual`.
