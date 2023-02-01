!!! info
    Don't expect that you can build app for all platforms on one platform.

* If your app has native dependency, it can be compiled only on the target platform unless [prebuild](https://www.npmjs.com/package/prebuild) is not used.

    [prebuild](https://www.npmjs.com/package/prebuild) is a solution, but most node modules [don't provide](https://github.com/atom/node-keytar/issues/27) prebuilt binaries.
  
* macOS Code Signing works only on macOS. [Cannot be fixed](http://stackoverflow.com/a/12156576).

Free public [Electron Build Service](https://github.com/electron-userland/electron-build-service) is used to build Electron app for Linux on Windows. On macOS/Linux you can build Electron app for Windows locally, except Appx for Windows Store (in the future (feel free to file issue) electron-build-service will support Appx target).

You can use build servers — e.g. [Travis](https://travis-ci.org) to build macOS/Linux apps and [AppVeyor](http://www.appveyor.com/) to build Windows app.

By default build for current platform and current arch. Use CLI flags `--mac`, `--win`, `--linux` to specify platforms. And `--ia32`, `--x64` to specify arch.

For example, to build app for MacOS, Windows and Linux:
```
electron-builder -mwl
```

Build performed in parallel, so, it is highly recommended to not use npm task per platform (e.g. `npm run dist:mac && npm run dist:win32`), but specify multiple platforms/targets in one build command.
You don't need to clean dist output before build — output directory is cleaned automatically.

## Sample `.travis.yml` to Build Electron App for macOS, Linux and Windows

??? example "sample .travis.yml"
    ```yaml
    matrix:
      include:
        - os: osx
          osx_image: xcode10.2
          language: node_js
          node_js: "10"
          env:
            - ELECTRON_CACHE=$HOME/.cache/electron
            - ELECTRON_BUILDER_CACHE=$HOME/.cache/electron-builder
    
        - os: linux
          services: docker
          language: generic
    
    cache:
      directories:
        - node_modules
        - $HOME/.cache/electron
        - $HOME/.cache/electron-builder
    
    script:
      - |
        if [ "$TRAVIS_OS_NAME" == "linux" ]; then
          docker run --rm \
            --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS|APPVEYOR_|CSC_|_TOKEN|_KEY|AWS_|STRIP|BUILD_') \
            -v ${PWD}:/project \
            -v ~/.cache/electron:/root/.cache/electron \
            -v ~/.cache/electron-builder:/root/.cache/electron-builder \
            electronuserland/builder:wine \
            /bin/bash -c "yarn --link-duplicates --pure-lockfile && yarn release --linux --win"
        else
          yarn release
        fi
    before_cache:
      - rm -rf $HOME/.cache/electron-builder/wine
    
    branches:
      except:
        - "/^v\\d+\\.\\d+\\.\\d+$/"
    ```

## Sample `appveyor.yml` to Build Electron App for Windows

Use AppVeyor only if:
* you need to build AppX,
* or your app has native dependency and prebuilt binary is not provided.

Otherwise see above sample `.travis.yml` to build Windows on Linux using provided [Docker](#docker) image.

??? example "sample appveyor.yml"
    ```yaml
    image: Visual Studio 2017
    
    platform:
      - x64
    
    cache:
      - node_modules
      - '%USERPROFILE%\.electron'
    
    init:
      - git config --global core.autocrlf input
    
    install:
      - ps: Install-Product node 10 x64
      - yarn
    
    build_script:
      - yarn dist
    
    test: off
    ```

## macOS

All required system dependencies (except rpm) will be downloaded automatically on demand on macOS 10.12+ (macOS Sierra). On Travis, please add `osx_image: xcode10.2` (see above sample `.travis.yml`).

To build rpm: `brew install rpm` ([brew](https://brew.sh)).

## Linux

You can use [Docker](#docker) to avoid installing system dependencies.

To build app in distributable format for Linux:
```
sudo apt-get install --no-install-recommends -y libopenjp2-tools
```

To build rpm: `sudo apt-get install --no-install-recommends -y rpm` (or `sudo yum install rpm-build`).

To build pacman: `sudo apt-get install --no-install-recommends -y bsdtar`.

To build snap *if and only if you have custom stage packages* (if you don't have custom snap build configuration, you don't need to install). See [snapcraft](https://snapcraft.io/snapcraft) in Store.
```
sudo snap install snapcraft --classic
sudo snap install multipass --beta --classic
```

### To build app for Windows on Linux:

[Docker](#docker) (`electronuserland/builder:wine`) is recommended to avoid installing system dependencies.

* Install Wine (2.0+ is required) — see [WineHQ Binary Packages](https://www.winehq.org/download#binary).
* Install [Mono](http://www.mono-project.com/download/#download-lin) (4.2+ is required) if you want to use Squirrel.Windows (NSIS, default target, doesn't require mono).

### To build app in 32 bit from a machine with 64 bit:

```
sudo apt-get install --no-install-recommends -y gcc-multilib g++-multilib
```

## Travis Linux
[Xenial](https://docs.travis-ci.com/user/trusty-ci-environment/) is required.
```yaml
sudo: required
dist: xenial
```

### Travis macOS
[macOS 10.14+](https://docs.travis-ci.com/user/osx-ci-environment/#OS-X-Version) is required.
```yaml
osx_image: xcode10.2
```

## Docker

To build Linux or Windows on any platform.

!!! warning
    You cannot build for Windows using Docker if you have native dependencies and native dependency doesn't use [prebuild](https://www.npmjs.com/package/prebuild).

See example Docker usage on a CI server in the [sample .travis.yml](https://github.com/develar/onshape-desktop-shell/blob/master/.travis.yml).

!!! note
    Do not use Docker Toolbox on macOS. Only [Docker for Mac](https://docs.docker.com/docker-for-mac/install/) works.

### Build Electron App using Docker on a Local Machine

1. Run docker container:

    ```sh
    docker run --rm -ti \
     --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
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

!!! tip
    If you don't need to build Windows, use image `electronuserland/builder` (wine is not installed in this image).

### Provided Docker Images

* `electronuserland/builder` or `electronuserland/builder:12` — NodeJS 10 and required system dependencies. Based on `builder:base`. Use this image if you need to build only Linux targets.
* `electronuserland/builder:wine` — Wine, NodeJS 10 and required system dependencies. Based on `builder:10`. Use this image if you need to build Windows targets.
* `electronuserland/builder:wine-mono` — Mono for Squirrel.Windows. Based on `builder:wine`. Use this image if you need to build Squirrel.Windows target.
* `electronuserland/builder:wine-chrome` — `google-chrome-stable` and `xvfb` are available — you can use this image for headless testing of Electron application. Based on `builder:wine`.
* `electronuserland/builder:base` — Required system dependencies. Not supposed to be used directly.
