# Creating installers for OS X

Creating `dmg` files is currently **only supported on OS X machines**.

## Command

```
$ electron-builder dist/osx/someFancy.app --platform=osx --out=/some/path/ --config=config.json
```

### Parameters

#### `osx.title`
Title of the generated `dmg` file.

#### `osx.background`
Background of the `dmg` dialog.

#### `osx.icon`
Your application mount icon.

#### `osx.icon-size`
Sizes of the icons included in `dmg` dialog.

#### `osx.contents`
This property contains the configuration for the OSX dmg window. This property is passed to `appdmg`, which builds the dmg package. For a deeper explanation of the different options that you can set in this property, visit [`appdmg`'s page](https://www.npmjs.com/package/appdmg).
