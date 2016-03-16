# Options

In the development `package.json` custom `build` field can be specified to customize format:
```json
"build": {
  "osx": {
    "title": "computed name from the app package.js, you can overwrite",
    "icon": "build/icon.icns",
    "icon-size": 80,
    "background": "build/background.png",
    "contents": [
      {
        "x": 410,
        "y": 220,
        "type": "link",
        "path": "/Applications"
      },
      {
        "x": 130,
        "y": 220,
        "type": "file",
        "path": "computed path to artifact, do not specify it - will be overwritten"
      }
    ]
  },
  "win": "see https://github.com/electronjs/windows-installer#usage"
}
```

As you can see, you need to customize OS X options only if you want to provide custom `x, y`.
Don't customize paths to background and icon, — just follow conventions (if you don't want to use `build` as directory of resources — please create issue to ask ability to customize it).

See [OS X options](https://www.npmjs.com/package/appdmg#json-specification) and [Windows options](https://github.com/electronjs/windows-installer#usage).

Here documented only `electron-builder` specific options:

| Name |  Description
| --- | ---
| <a name="iconUrl"></a>iconUrl<br/> | <p>*windows-only.* A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Atom icon.</p><p>Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.</p><ul><li>If you don't plan to build windows installer, you can omit it.</li><li>If your project repository is public on GitHub, it will be `https://raw.githubusercontent.com/${info.user}/${info.project}/master/build/icon.ico` by default.</li></ul>
| <a name="extraResources"></a>extraResources | <p>A [glob expression](https://www.npmjs.com/package/glob#glob-primer), when specified, copy the file or directory with matching names directly into the app's directory (`Contents/Resources` for OS X).</p><p>You can use `${os}` (expanded to osx, linux or win according to current platform) and `${arch}` in the pattern.</p><p>If directory matched, all contents are copied. So, you can just specify `foo` to copy `<project_dir>/foo` directory.</p><p>May be specified in the platform options (i.e. in the `build.osx`).
