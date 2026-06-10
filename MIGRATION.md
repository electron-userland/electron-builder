# Migration Guide

## v26 → v27

v27 migrates the entire electron-builder package ecosystem to native ES modules and requires Node.js >=22.12.0.

**Most projects need only a Node.js version bump.** Build configuration, the `build()` API, and all exported types are unchanged. CJS `require()` continues to work on Node >=22.12 — no code changes needed unless you relied on `electronCompile`.

Full guide: **[https://www.electron.build/docs/migration/v26-to-v27](https://www.electron.build/docs/migration/v26-to-v27)**

### Breaking changes at a glance

| Change | Action required |
|--------|----------------|
| **Node.js >=22.12.0 required** | Update runtime and CI |
| All packages are native ESM | None — CJS `require()` still works on Node >=22.12 |
| `electronCompile` config option removed | Remove from config; migrate to a modern bundler |
| `electron-forge-maker-*` are now ESM | None — same API, same `export default` shape |

### 1. Update Node.js

```bash
# nvm
nvm install 22 && nvm use 22

# fnm
fnm install 22 && fnm use 22
```

GitHub Actions:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
```

### 2. ESM/CJS — no code changes needed on Node >=22.12

```js
// CJS — still works
const { build } = require("electron-builder")

// ESM — now the preferred style
import { build } from "electron-builder"
```

### 3. Remove `electronCompile` from build config (if present)

```json5
{
  "build": {
    "electronCompile": true  // ← remove this line
  }
}
```

Migrate to [electron-vite](https://electron-vite.org/), [esbuild](https://esbuild.github.io/), or [webpack](https://webpack.electron.build/).

### Full migration details

See the complete guide at [https://www.electron.build/docs/migration/v26-to-v27](https://www.electron.build/docs/migration/v26-to-v27).
