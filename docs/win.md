# Creating installers for windows

If you're on OS X/Linux and want to build for Windows, you need to have Wine installed. Wine is required in order to set the correct icon for the exe.

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

## Command

```
$ electron-builder dist/win/someFancy-win32 --platform=win --out=/some/path/ --config=config.json
```

### Parameters

#### `win.title`
Title of your application shown in generated windows installer.

#### `win.version`
Version of your application shown in add/remove programs list.

#### `win.publisher`
Publisher shown in add/remove programs list.

#### `win.icon`
Icon to be shown in installation process.

#### `win.nsiTemplate` *( optional )*
Option to define a custom NSI installation file.

#### `win.verbosity` *( optional )*
Number 0-4 :  where 4=all, 3=no script, 2=no info, 1=no warnings, 0=none [Default 3]

#### `win.fileAssociation` *( optional )*
Option to define a custom file association on Windows.
Caution: when you use `win.nsiTemplate` option, `win.fileAssociation` option should only work
if the custom nsi template is based on the original one.
