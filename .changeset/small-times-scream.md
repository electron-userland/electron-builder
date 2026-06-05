---
"electron-builder-squirrel-windows": major
"builder-util-runtime": major
"electron-builder": major
"electron-publish": major
"electron-updater": major
"app-builder-lib": major
"builder-util": major
"dmg-builder": major
"electron-forge-maker-appimage": major
"electron-forge-maker-nsis": major
"electron-forge-maker-nsis-web": major
"electron-forge-maker-snap": major
---

feat!: migrate to native ESM, require Node.js >=22.12.0, remove electron-compile

**Breaking changes:**

- **Node.js >=22.12.0 required.** This is the version where `require(esm)` was stabilized, allowing CJS consumers to `require()` these packages without a separate `.cjs` build or any flags.
- **`electronCompile` configuration option removed.** `electron-compile` is unmaintained and has been fully removed. Use a modern bundler (Vite, webpack, esbuild, etc.) instead. See the [v26 to v27 migration guide](https://www.electron.build/docs/migration/v26-to-v27) for details.
- All packages now ship as native ES modules (`"type": "module"`). CJS consumers on Node >=22.12.0 can continue using `require()` unchanged; the package automatically handles this via Node's stable `require(esm)` support.
- `electron-forge-maker-{appimage,nsis,nsis-web,snap}` are now ES modules.

**Other changes:**

- Adds `/internal` subpath export on each package for workspace-internal sharing without polluting the public API.
- All imports use explicit `.js` extensions as required by Node ESM resolution.
- `electron-updater`'s `autoUpdater` proxy continues to work synchronously via `createRequire` — no API change.
