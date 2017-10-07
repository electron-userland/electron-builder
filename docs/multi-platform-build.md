Don't expect that you can build app for all platforms on one platform.

* If your app has native dependency, it can be compiled only on the target platform unless [prebuild](https://www.npmjs.com/package/prebuild) is not used.

  [prebuild](https://www.npmjs.com/package/prebuild) is a solution, but most node modules [don't provide](https://github.com/atom/node-keytar/issues/27) prebuilt binaries.
* macOS Code Signing works only on macOS. [Cannot be fixed](http://stackoverflow.com/a/12156576).

Don't think that mentioned issues are major, you should use build servers — e.g. [AppVeyor](http://www.appveyor.com/) to build Windows app and [Travis](https://travis-ci.org) to build MacOS/Linux apps.

By default build for current platform and current arch. Use CLI flags `--mac`, `--win`, `--linux` to specify platforms. And `--ia32`, `--x64` to specify arch.

For example, to build app for MacOS, Windows and Linux:
```
electron-builder -mwl
```

Build performed in parallel, so, it is highly recommended to not use npm task per platform (e.g. `npm run dist:mac && npm run dist:win32`), but specify multiple platforms/targets in one build command.
You don't need to clean dist output before build — output directory is cleaned automatically.

## Sample `.travis.yml` to Build Electron App for macOS, Linux and Windows

See [sample .travis.yml](https://github.com/develar/onshape-desktop-shell/blob/master/.travis.yml).

## Sample `appveyor.yml` to Build Electron App for Windows

Use AppVeyor only if:
* you need to build AppX,
* or your app has native dependency and prebuilt binary is not provided.

Otherwise see above sample `.travis.yml` to build Windows on Linux using provided [Docker](#docker) image.

See [sample appveyor.yml](https://gist.github.com/develar/bdf242a3cbf6120ed2300337f71e0982).

## macOS

All required system dependencies (except rpm) will be downloaded automatically on demand on macOS 10.12+ (macOS Sierra). On Travis, please add `osx_image: xcode9.0` (see above sample `.travis.yml`).

To build rpm: `brew install rpm` ([brew](https://brew.sh)).

## Linux

You can use [Docker](#docker) to avoid installing system dependencies.

To build app in distributable format for Linux:
```
sudo apt-get install --no-install-recommends -y icnsutils graphicsmagick
```

To build rpm: `sudo apt-get install --no-install-recommends -y rpm`.

To build pacman: `sudo apt-get install --no-install-recommends -y bsdtar`.

To build snap: `sudo apt-get install --no-install-recommends -y snapcraft`.

### To build app for Windows on Linux:

[Docker](#docker) (`electronuserland/builder:wine`) is recommended to avoid installing system dependencies.

* Install Wine (2.0+ is required) — see [WineHQ Binary Packages](https://www.winehq.org/download#binary).
* Install [Mono](http://www.mono-project.com/download/#download-lin) (4.2+ is required) if you want to use Squirrel.Windows (NSIS, default target, doesn't require mono).

### To build app in 32 bit from a machine with 64 bit:

```
sudo apt-get install --no-install-recommends -y gcc-multilib g++-multilib
```

## Travis Linux
[Trusty](https://docs.travis-ci.com/user/trusty-ci-environment/) is required — default Travis Linux dist is outdated and `icnsutils` version is non-functional.
```yaml
sudo: required
dist: trusty
```

### Travis macOS
[macOS 10.12+](https://docs.travis-ci.com/user/osx-ci-environment/#OS-X-Version) is required.
```yaml
osx_image: xcode9.0
```

## Docker

To build Linux or Windows on any platform. You cannot build for Windows using Docker if you have native dependencies and native dependency doesn't use [prebuild](https://www.npmjs.com/package/prebuild). 

See example Docker usage on a CI server in the [sample .travis.yml](https://github.com/develar/onshape-desktop-shell/blob/master/.travis.yml).

### Build Electron App using Docker on a Local Machine

1. Run docker container:

   ```sh
   docker run --rm -ti \
     --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
     --env ELECTRON_CACHE="/root/.cache/electron" \
     --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
     -v ${PWD}:/project \
     -v ${PWD##*/}-node-modules:/project/node_modules \
     -v ~/.cache/electron:/root/.cache/electron \
     -v ~/.cache/electron-builder:/root/.cache/electron-builder \
     electronuserland/builder:wine
   ```
   
2. Type in `yarn && yarn dist`
   
   If you don't have `dist` npm script in your `package.json`, call `./node_modules/.bin/electron-builder` directly.
   
Or to avoid second step, append to first command `/bin/bash -c "yarn && yarn dist"` You can use `/test.sh` to install dependencies and run tests.

If you don't need to build Windows, use image `electronuserland/builder` (wine is not installed in this image).

**NOTICE**: _Do not use Docker Toolbox on macOS._ Only [Docker for Mac](https://docs.docker.com/docker-for-mac/install/) works.

### Provided Docker Images

* `builder:base` — Required system dependencies. Not supposed to be used directly.
* `builder:8` or `builder` — NodeJS 8 and required system dependencies. Based on `builder:base`. Use this image if you need to build only Linux targets.
* `builder:6` — NodeJS 6 and required system dependencies. Based on `builder:base`.
* `builder:wine` — Wine, NodeJS 8 and required system dependencies. Based on `builder:8`. Use this image if you need to build Windows targets.
* `builder:wine-mono` — Mono for Squirrel.Windows. Based on `builder:wine`. Use this image if you need to build Squirrel.Windows target.
* `builder:wine-chrome` — `google-chrome-stable` and `xvfb` are available — you can use this image for headless testing of Electron application. Based on `builder:wine`.
