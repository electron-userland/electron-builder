Don't expect that you can build app for all platforms on one platform.

* If your app has native dependencies, it can be compiled only on the target platform.
[prebuild](https://www.npmjs.com/package/prebuild) is a solution, but most node modules [don't provide](https://github.com/atom/node-keytar/issues/27) prebuilt binaries.

* macOS Code Signing works only on macOS. [Cannot be fixed](http://stackoverflow.com/a/12156576).

Don't think that mentioned issues are major, you should use build servers — e.g. [AppVeyor](http://www.appveyor.com/) to build Windows app and [Travis](https://travis-ci.org) to build MacOS/Linux apps.

See [sample appveyor.yml](https://github.com/develar/onshape-desktop-shell/blob/master/appveyor.yml) to build Electron app for Windows.
And [sample .travis.yml](https://github.com/develar/onshape-desktop-shell/blob/master/.travis.yml) to build Electron app for MacOS.

By default build for current platform and current arch. Use CLI flags `--mac`, `--win`, `--linux` to specify platforms. And `--ia32`, `--x64` to specify arch.

For example, to build app for MacOS, Windows and Linux:
```
build -mwl
```

Build performed in parallel, so, it is highly recommended to not use npm task per platform (e.g. `npm run dist:mac && npm run dist:win32`), but specify multiple platforms/targets in one build command.
You don't need to clean dist output before build — output directory is cleaned automatically.

## macOS

Use [brew](http://brew.sh) to install required packages.

### To build app for Windows on macOS:
```
brew install wine --without-x11
brew install mono
```

### To build app for Linux on macOS:
```
brew install gnu-tar graphicsmagick xz
```

To build rpm: `brew install rpm`.

## Linux

To build app in distributable format for Linux:
```
sudo apt-get install --no-install-recommends -y icnsutils graphicsmagick xz-utils
```

To build rpm: `sudo apt-get install --no-install-recommends -y rpm`.

To build pacman: `sudo apt-get install --no-install-recommends -y bsdtar`.

### To build app for Windows on Linux:
* Install Wine (1.8+ is required):

  ```
  sudo add-apt-repository ppa:ubuntu-wine/ppa -y
  sudo apt-get update
  sudo apt-get install --no-install-recommends -y wine1.8
  ```

* Install [Mono](http://www.mono-project.com/docs/getting-started/install/linux/#usage) (4.2+ is required):

  ```
  sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF
  echo "deb http://download.mono-project.com/repo/debian wheezy main" | sudo tee /etc/apt/sources.list.d/mono-xamarin.list
  sudo apt-get update
  sudo apt-get install --no-install-recommends -y mono-devel ca-certificates-mono
  ```

### To build app in 32 bit from a machine with 64 bit:

```
sudo apt-get install --no-install-recommends -y gcc-multilib g++-multilib
```

### Travis Linux
[Trusty](https://docs.travis-ci.com/user/trusty-ci-environment/) is required — default Travis Linux dist is outdated and `icnsutils` version is non-functional.
```yaml
sudo: required
dist: trusty
```

## Windows

Use [Docker](https://github.com/electron-userland/electron-builder/wiki/Docker).
