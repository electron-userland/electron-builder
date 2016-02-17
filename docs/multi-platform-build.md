# Multi-platform build

Don't expect that you can build app for all platforms on one platform.

* If your app has native dependencies, it can be compiled only on the target platform.
[prebuild](https://www.npmjs.com/package/prebuild) is a solution, but most node modules [don't provide](https://github.com/atom/node-keytar/issues/27) prebuilt binaries.

* OS Code Signing works only OS X. [Cannot be fixed](http://stackoverflow.com/a/12156576).
* Windows Code Signing works only on Windows. We are going [to fix it](https://developer.mozilla.org/en/docs/Signing_an_executable_with_Authenticode) soon.

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
brew install ruby gnu-tar libicns
gem install fpm
```

Please note — Windows codesign supported currently only on Windows.

Linux and Windows: not documented yet.