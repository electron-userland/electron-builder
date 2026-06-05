# Migration Guide

## v26 → v27

v27 migrates the entire electron-builder package ecosystem to native ES modules and requires Node.js >=22.12.0. Most projects need only a Node.js version bump; build configuration is unchanged.

Full guide: **[https://www.electron.build/docs/migration/v26-to-v27](https://www.electron.build/docs/migration/v26-to-v27)**

### Breaking changes at a glance

| Change | Action required |
|--------|----------------|
| **Node.js >=22.12.0 required** | Update your runtime and CI environment |
| All packages are native ESM | Usually none — CJS `require()` still works on Node >=22.12 |
| `electronCompile` config option removed | Migrate to a modern bundler (Vite, esbuild, webpack) |
| `electron-forge-maker-*` are now ESM | Usually none — same API |

### 1. Update Node.js to >=22.12.0

```bash
# nvm
nvm install 22 && nvm use 22

# fnm
fnm install 22 && fnm use 22
```

CI (GitHub Actions):
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
```

### 2. ESM/CJS — no code changes needed on Node >=22.12

Both styles continue to work:

```js
// CJS — still works on Node >=22.12.0
const { build } = require("electron-builder")

// ESM — now the preferred style
import { build } from "electron-builder"
```

### 3. Remove `electronCompile` from build config

```json5
{
  "build": {
    "electronCompile": true  // ← remove this line
  }
}
```

If your project uses `electron-compile`, migrate to [Vite](https://electron-vite.org/), [esbuild](https://esbuild.github.io/), or [webpack](https://webpack.electron.build/) before upgrading.

### Full migration details

See the complete guide at [https://www.electron.build/docs/migration/v26-to-v27](https://www.electron.build/docs/migration/v26-to-v27).
