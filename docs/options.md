# Options

In the development `package.json` custom `build` field can be specified to customize format:
```json
"build": {
  "osx": {
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
  }
}
```

As you can see, you need to customize OS X options only if you want to provide custom `x, y`.
Don't customize paths to background and icon, — just follow conventions (if you don't want to use `build` as directory of resources — please create issue to ask ability to customize it).

Here documented only `electron-builder` specific options:

<!-- do not edit. start of generated block -->

<a name="#AppMetadata"></a>
# Application `package.json`
| Name | Description
| --- | ---
| <a name="#AppMetadata-name"></a>name | The application name.
| <a name="#AppMetadata-productName"></a>productName | <p>As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).</p>

<a name="#DevMetadata"></a>
# Development `package.json`
| Name | Description
| --- | ---
| <a name="#DevMetadata-homepage"></a>homepage | <p>The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package <code>projectUrl</code> (optional) or Linux Package URL (required)).</p> <p>If not specified and your project repository is public on GitHub, it will be <code>https://github.com/${user}/${project}</code> by default.</p>
| <a name="#DevMetadata-license"></a>license | *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name for this package.
| <a name="#DevMetadata-build"></a>build | See [.build](#BuildMetadata).

<a name="#BuildMetadata"></a>
## `.build`
| Name | Description
| --- | ---
| <a name="#BuildMetadata-iconUrl"></a>iconUrl | <p>*windows-only.* A URL to an ICO file to use as the application icon (displayed in Control Panel &gt; Programs and Features). Defaults to the Atom icon.</p> <p>Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.</p> <ul> <li>If you don’t plan to build windows installer, you can omit it.</li> <li>If your project repository is public on GitHub, it will be <code>https://raw.githubusercontent.com/${user}/${project}/master/build/icon.ico</code> by default.</li> </ul>
| <a name="#BuildMetadata-productName"></a>productName | See [AppMetadata.productName](#AppMetadata-productName).
| <a name="#BuildMetadata-extraResources"></a>extraResources | <p>A [glob expression](https://www.npmjs.com/package/glob#glob-primer), when specified, copy the file or directory with matching names directly into the app’s directory (<code>Contents/Resources</code> for OS X).</p> <p>You can use <code>${os}</code> (expanded to osx, linux or win according to current platform) and <code>${arch}</code> in the pattern.</p> <p>If directory matched, all contents are copied. So, you can just specify <code>foo</code> to copy <code>&lt;project_dir&gt;/foo</code> directory.</p> <p>May be specified in the platform options (i.e. in the <code>build.osx</code>).</p>
| <a name="#BuildMetadata-osx"></a>osx | See [OS X options](https://www.npmjs.com/package/appdmg#json-specification)
| <a name="#BuildMetadata-win"></a>win | See [windows-installer options](https://github.com/electronjs/windows-installer#usage)
| <a name="#BuildMetadata-linux"></a>linux | See [.linux](#DebOptions).

<a name="#DebOptions"></a>
### `.build.linux`
| Name | Description
| --- | ---
| <a name="#DebOptions-compression"></a>compression | *deb-only.* The compression type to use, must be one of gz, bzip2, xz. (default: `xz`)

<!-- end of generated block -->
