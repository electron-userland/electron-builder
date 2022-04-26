!!! warning
    Important: This approach must be used only in development environment.
    Since the release version of your application the `app` directory should self contain all used files.

In case on development environment your app runs the main process (executed by electron) not inside the `/app` folder. You may need to load the `/app` dependencies manually. Because the app dependencies are be placed at `/app/node_modules` and your main process that is running in a different directory will not have access by default to that directory.

Instead of duplicating the app dependencies in the development `package.json` it is possible to make the electron main process load the app dependencies manually with an approach like this:

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
