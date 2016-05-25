Don't expect that you can build app for all platforms on one platform.

* If your app has native dependencies, it can be compiled only on the target platform.
[prebuild](https://www.npmjs.com/package/prebuild) is a solution, but most node modules [don't provide](https://github.com/atom/node-keytar/issues/27) prebuilt binaries.

* OS Code Signing works only OS X. [Cannot be fixed](http://stackoverflow.com/a/12156576).
* Windows Code Signing doesn't work on Linux. We are going to fix it soon.

Don't think that mentioned issues are major, you should use build servers — e.g. [AppVeyor](http://www.appveyor.com/) to build Windows app and [Travis](https://travis-ci.org) to build OS X/Linux apps.

See [sample appveyor.yml](https://github.com/develar/onshape-desktop-shell/blob/master/appveyor.yml) to build Electron app for Windows.
And [sample .travis.yml](https://github.com/develar/onshape-desktop-shell/blob/master/.travis.yml) to build Electron app for OS X.

## OS X

Use [brew](http://brew.sh) to install required packages.

To build app in distributable format for Windows on OS X:
```
brew install Caskroom/cask/xquartz wine mono
```

To build app in distributable format for Linux on OS X:
```
brew install gnu-tar libicns graphicsmagick
```

To build rpm: `brew install rpm`.

## Linux
To build app in distributable format for Linux:
```
sudo apt-get install --no-install-recommends -y icnsutils graphicsmagick xz-utils
```

To build rpm: `sudo apt-get install --no-install-recommends -y rpm`.

To build pacman: `sudo apt-get install --no-install-recommends -y bsdtar`.

To build app in distributable format for Windows on Linux:
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

* Install osslsigncode.
  ```
  apt-get install --no-install-recommends -y osslsigncode
  ```

To build app in 32 bit from a machine with 64 bit:

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

Not documented yet.
