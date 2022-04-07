!!! info
    Since version 8 electron-builder rebuilds only production dependencies, so, you are not forced to use two package.json structure.

1. For development (`./package.json`)
    
    The `package.json` resides in the root of your project. Here you declare the dependencies for your development environment and build scripts (`devDependencies`).

2. For your application (`./app/package.json`)

    The `package.json` resides in the `app` directory. Declare your application dependencies (`dependencies`) here. *Only this directory is distributed with the final, packaged application.*

Why?

1. Native npm modules (those written in C, not JavaScript) need to be compiled and here we have two different compilation targets for them. Those used within the application need to be compiled against the electron runtime and all `devDependencies` need to be compiled against your local node.js environment. Thanks to the two `package.json` structure, this is trivial (see [#39](https://github.com/electron-userland/electron-builder/issues/39)).
2. No need to specify which [files](../configuration/configuration.md#Configuration-files) to include in the app (because development files reside outside the `app` directory).

Please see [Loading App Dependencies Manually](loading-app-dependencies-manually.md) and [#379](https://github.com/electron-userland/electron-builder/issues/379#issuecomment-218503881).

If you use the two-package.json project structure, you'll only have your `devDependencies` in your development `package.json` and your `dependencies` in your app `package.json`. To ensure your dependencies are always updated based on both files, simply add `"postinstall": "electron-builder install-app-deps"` to your development `package.json`. This will basically automatically trigger an `npm install` within your app directory so you don't have to do this work every time you install/update your dependencies.

!!! info "Metadata"
    All the meta fields should be in the `app/package.json` (`version`, `name` and so on).
