To build Linux or Windows (only if you don't have native dependencies) on any platform:

1. Run docker container:

   ```sh
   docker run --rm -ti -v ${PWD}:/project -v ${PWD##*/}-node-modules:/project/node_modules \
     -v ~/.cache/electron:/root/.cache/electron \
     ~/.cache/electron-builder:/root/.cache/electron-builder \
     electronuserland/electron-builder:wine
   ```
   
2. Type in `yarn && yarn dist`
   
   If you don't have `dist` npm script in your `package.json`, call `./node_modules/.bin/electron-builder` directly.

Or to avoid second step, append to first command `/bin/bash -c "yarn && yarn dist"`

If you don't need to build Windows, use image `electronuserland/electron-builder:latest` (wine is not installed in this image).

You can use `/test.sh` to install npm dependencies and run tests.

**NOTICE**: _Do not use Docker Toolbox on macOS._ Only [Docker for Mac](https://docs.docker.com/engine/installation/mac/docker.md#/docker-for-mac) works.

`google-chrome-stable` and `xvfb` are available — you can use electron-builder Docker image for headless testing.