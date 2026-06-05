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

## Breaking changes

### Node.js >=22.12.0 required

v27 requires Node.js 22.12.0 or later. This is the version where Node's
[`require(esm)`](https://nodejs.org/en/blog/release/v22.12.0) support was
stabilized without flags, which means **CJS `require()` callers need no code
changes** on supported Node versions.

```bash
nvm install 22 && nvm use 22
```

CI (GitHub Actions):
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
```

### All packages are now native ES modules

Every package now ships with `"type": "module"`. On Node >=22.12.0 both
import styles continue to work:

```js
// CJS — unchanged
const { build } = require("electron-builder")

// ESM — now the preferred style
import { build } from "electron-builder"
```

TypeScript projects using `"moduleResolution": "bundler"` or `"node16"` / `"nodenext"` work as before.

### `electronCompile` configuration option removed

`electron-compile` is an unmaintained library (last release 2019) and has
been fully removed. If your config includes `electronCompile: true`, remove
that line and migrate to a modern bundler:

- **[electron-vite](https://electron-vite.org/)** — fast, first-class ESM support
- **[esbuild](https://esbuild.github.io/)** — minimal config, very fast
- **[webpack](https://webpack.electron.build/)** — mature ecosystem

```json5
{
  "build": {
    "electronCompile": true  // ← delete this line
  }
}
```

### `electron-forge-maker-*` are now ES modules

The four Electron Forge maker plugins now export a default ESM export.
The public API shape is identical; Forge loads them via dynamic `import()`
internally so no config change is required.

---

## New features

- **Linux `syncDesktopName`** — new config option to align the installed
  `.desktop` filename with `StartupWMClass`, fixing taskbar pinning on GNOME.
- **macOS `pkgbuild --version`** — `pkgbuild` is now passed `--version`
  explicitly, resolving a signing regression introduced in a recent Xcode update.
- **Smart cache deep-merge** — shard caches now deep-merge on Linux so
  timing data survives across CI runs.
- **`/internal` subpath exports** — each package now exposes an `./internal`
  export entry for workspace-internal sharing without polluting the public API.
  This is not part of the public API and may change without notice.

---

## Migration guide

See the full guide: **https://www.electron.build/docs/migration/v26-to-v27**

**TL;DR checklist:**
- [ ] Update Node.js to >=22.12.0
- [ ] Update `node-version: '22'` in CI
- [ ] Remove `electronCompile: true` from build config (if present)
- [ ] Migrate off `electron-compile` to a modern bundler (if applicable)
