The top-level [dmg](configuration.md#dmg) key contains set of options instructing electron-builder on how it should build [DMG](https://en.wikipedia.org/wiki/Apple_Disk_Image).

## DMG License

To add license to DMG, create file `license_LANG_CODE.txt` in the build resources. Multiple license files in different languages are supported — use lang postfix (e.g. `_de`, `_ru`)). For example, create files `license_de.txt` and `license_en.txt` in the build resources.
If OS language is german, `license_de.txt` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).

You can also change the default button labels of the DMG by passing a json file named `licenseButtons_LANG_CODE.json`. The german file would be named: `licenseButtons_de.json`.
The contain file should have the following format:
```json
{
  "lang": "English",
  "agree": "Agree",
  "disagree": "Disagree",
  "print": "Print",
  "save": "Save",
  "description": "Here is my own description"
}
```

## Configuration

{!./app-builder-lib.Interface.DmgOptions.md!}