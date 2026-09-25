---
"electron-updater": patch
---

fix: expose `./package.json` in the `exports` map so tooling (including electron-builder's installed-version check) can resolve the installed version via `require.resolve("electron-updater/package.json")`
