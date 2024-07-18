docker run --rm -it  \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  --env USE_SYSTEM_APP_BUILDER="true" \
  --env CUSTOM_APP_BUILDER_PATH="/usr/bin/app-builder" \
  --env WINEDEBUG=+all \
  --env TEST_FILES="$TEST_FILES" \
  -v "$PWD/../app-builder/linux/x64/app-builder:/usr/bin/app-builder" \
  -v "$PWD/electron-cache":/root/.cache/electron \
  -v "$PWD/electron-builder-cache":/root/.cache/electron-builder \
  -v "$PWD/dist":/project/dist \
  -v "$PWD":/project \
  -v $(pwd)/docker-node-modules:/project/node_modules \
  electronuserland/builder:20-wine-mono /bin/bash -c "pnpm install && node ./test/out/helpers/runTests.js"