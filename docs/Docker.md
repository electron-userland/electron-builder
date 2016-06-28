To build Linux or Windows (only if you don't have native dependencies) on any platform:

1. Run docker container:
   ```sh
   docker run --rm -ti -v ${PWD}:/project -v ${PWD##*/}-node-modules:/project/node_modules -v ~/.electron:/root/.electron electronuserland/electron-builder:wine
   ```
2. Type in `npm install && npm prune && npm run dist`
   
   If you don't have `dist` npm script in your `package.json`, call `./node_modules/.bin/build` directly.

Or to avoid second step, append to first command `/bin/bash -c "npm install && npm prune && npm run dist"`

If you don't need to build Windows, use image `electronuserland/electron-builder:latest` (wine is not installed in this image).

You can use `/test.sh` to install npm dependencies and run tests.