## Pre-requisites
If you're on OS X/Linux and want to build for Windows, you need Wine installed. Wine is required in order to set the correct icon for the exe.

You will also need the nullsoft scriptable install system for all platforms.

On OS X, via Homebrew
```
$ brew install wine makensis
```
On Ubuntu(-based) Linux distributions, via apt:
```
# add-apt-repository ppa:ubuntu-wine/ppa -y
# apt-get update
# apt-get install wine nsis -y
```
On Windows, download the [nullsoft scriptable installer](http://nsis.sourceforge.net/Download)
You need to include NSIS in your PATH to find `makensis`, set your global environment variable or you can set a session variable using:
```
set PATH=%PATH%;C:\Program Files (x86)\NSIS
```

If you're on OS X/Linux and want to build for Windows, make also sure you're running at least `v0.12.0` of node.js.

```
$ node --version
v0.12.0
```