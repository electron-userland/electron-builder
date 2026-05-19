---
title: "Loading App Dependencies Manually"
---

:::warning
This approach must only be used in a development environment. In production, electron-builder packages the `app/` directory as a self-contained bundle — no manual path injection is needed or appropriate.
:::

## Background

This tutorial is relevant only if you use the **two-package.json structure** (see [Two Package Structure](two-package-structure.md)) where:

- A root `package.json` holds your `devDependencies` (Electron, electron-builder, build tools)
- An `app/package.json` holds your actual app `dependencies` — only this is packaged and shipped

During **development**, your `main.js` entry point typically lives outside the `app/` directory (e.g., `src/main.js`). When Electron runs it, Node.js resolves modules relative to that file's location — meaning `app/node_modules` is **not** on the module search path by default.

Rather than duplicating your app dependencies in the root `package.json`, you can manually inject the `app/node_modules` path into Node's module resolution at startup, in dev mode only:

If you are not using the two-package.json structure, you do not need this tutorial.

```js
// given this file is: /src/browser/main.js

const path = require('path')
const devMode = (process.argv || []).indexOf('--dev') !== -1

// load the app dependencies in dev mode
if (devMode) {
  const PATH_APP_NODE_MODULES = path.join(__dirname, '..', '..', 'app', 'node_modules')
  const Module = require('module')
  
  // for electron 16 or lower
  Module.globalPaths.push(PATH_APP_NODE_MODULES)
  
  // for electron 17 or higher
  const nodeModulePaths = Module._nodeModulePaths
  Module._nodeModulePaths = (from) =>
    nodeModulePaths(from).concat([PATH_APP_NODE_MODULES])
}
```
