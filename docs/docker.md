To build Linux or Windows (only if you don't have native dependencies) on any platform:

1. Run docker container:

   ```sh
   docker run --rm -ti \
     --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
     -v ${PWD}:/project \
     -v ${PWD##*/}-node-modules:/project/node_modules \
     -v ~/.cache/electron:/root/.cache/electron \
     -v ~/.cache/electron-builder:/root/.cache/electron-builder \
     electronuserland/builder:wine
   ```
   
2. Type in `yarn && yarn dist`
   
   If you don't have `dist` npm script in your `package.json`, call `./node_modules/.bin/electron-builder` directly.

Or to avoid second step, append to first command `/bin/bash -c "yarn && yarn dist"`

If you don't need to build Windows, use image `electronuserland/builder` (wine is not installed in this image).

You can use `/test.sh` to install dependencies and run tests.

**NOTICE**: _Do not use Docker Toolbox on macOS._ Only [Docker for Mac](https://docs.docker.com/engine/installation/mac/docker.md#/docker-for-mac) works.

# Provided Docker Images

* `builder:base` — Required system dependencies. Not supposed to be used directly.
* `builder:8` or `builder` — NodeJS 8 and required system dependencies. Based on `builder:base`. Use this image if you need to build only Linux targets.
* `builder:6` — NodeJS 6 and required system dependencies. Based on `builder:base`.
* `builder:wine` — Wine, NodeJS 8 and required system dependencies. Based on `builder:8`. Use this image if you need to build Windows targets.
* `builder:wine-mono` — Mono for Squirrel.Windows. Based on `builder:wine`. Use this image if you need to build Squirrel.Windows target.
* `builder:wine-chrome` — `google-chrome-stable` and `xvfb` are available — you can use this image for headless testing of Electron application. Based on `builder:wine`.