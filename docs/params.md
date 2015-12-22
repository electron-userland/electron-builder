## OSX

### `osx.title`
Title of the generated `dmg` file.

### `osx.background`
Background of the `dmg` dialog.

### `osx.icon`
Your application mount icon.

### `osx.icon-size`
Sizes of the icons included in `dmg` dialog.

### `osx.contents`
This property contains the configuration for the OSX dmg window. This property is passed to `appdmg`, which builds the dmg package. For a deeper explanation of the different options that you can set in this property, visit [`appdmg`'s page](https://www.npmjs.com/package/appdmg).

## Windows

### `win.title`
Title of your application shown in generated windows installer.

### `win.version`
Version of your application shown in add/remove programs list.

### `win.icon`
Icon to be shown in installation process.

### `win.nsiTemplate` *( optional )*
Option to define a custom NSI installation file.

### `win.verbosity` *( optional )*
Number 0-4 :  where 4=all, 3=no script, 2=no info, 1=no warnings, 0=none [Default 3]

### `win.fileAssociation` *( optional )*
Option to define a custom file association on Windows.
Caution: when you use `win.nsiTemplate` option, `win.fileAssociation` option should only work
if the custom nsi template is based on the original one.

**Note:** You need to add something that might have value for others? Please consider a PR. ;)