---
title: CLI
---

<!-- HELP_OUTPUT_START -->
```
  • please use as subcommand: electron-builder publish
Options:
      --help                             Show help                     [boolean]
  -f, --files                            The file(s) to upload to your publisher
                                                              [array] [required]
  -v, --version                          The app/build version used when
                                         searching for an upload release (used
                                         by some Publishers)            [string]
  -c, --config, --configurationFilePath  The path to an electron-builder config.
                                         Defaults to `electron-builder.yml` (or
                                         `json`, or `json5`, or `js`, or `ts`),
                                         see https://goo.gl/YFRJOM      [string]
  -p, --policy                           Publish trigger policy, see
                                         https://www.electron.build/publish
       [string] [choices: "onTag", "onTagOrDraft", "always", "never", undefined]
```
<!-- HELP_OUTPUT_END -->

For other commands please see help using `--help` arg, e.g. `./node_modules/.bin/electron-builder install-app-deps --help`

:::tip
Since Node.js 8 [npx](https://medium.com/@maybekatz/introducing-npx-an-npm-package-runner-55f7d4bd282b) is bundled, so you can simply use `npx electron-builder`.
:::

Prepend `npx` to sample commands below if you run them from Terminal and not from `package.json` scripts.

:::note[build for macOS, Windows and Linux]
`electron-builder -mwl`
:::

:::note[build deb and tar.xz for Linux]
`electron-builder --linux deb tar.xz`
:::

:::note[build NSIS 32-bit installer for Windows]
`electron-builder --windows nsis:ia32`
:::

:::note[set package.json property `foo` to `bar`]
`electron-builder -c.extraMetadata.foo=bar`
:::

:::note[configure unicode options for NSIS]
`electron-builder -c.nsis.unicode=false`
:::

## Target

Without target configuration, electron-builder builds Electron app for current platform and current architecture using default target.

* macOS - DMG and ZIP for Squirrel.Mac.
* Windows - [NSIS](./nsis.md).
* Linux:
    - if you build on Windows or macOS: [Snap](./snap.md) and [AppImage](./appimage.md) for x64.
    - if you build on Linux: [Snap](./snap.md) and [AppImage](./appimage.md) for current architecture.

Platforms and archs can be configured using [CLI args](https://github.com/electron-userland/electron-builder#cli-usage), or in the configuration.

For example, if you don't want to pass `--ia32` and `--x64` flags each time, but instead build by default NSIS target for all archs for Windows:

:::note[Configuration]

package.json
```json
"build": {
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": [
          "x64",
          "ia32"
        ]
      }
    ]
  },
  "mac": {
    "target": [
      {
        "target": "dmg",
        "arch": [
          "universal"
        ]
      }
    ]
  }
}
```

electron-builder.yml
```yaml
win:
  target:
    - target: nsis
      arch:
        - x64
        - ia32
mac:
  target:
    - target: dmg
      arch: universal
```

electron-builder.config.js
```js
module.exports = {
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": [
          "x64",
          "ia32"
        ]
      }
    ]
  },
  "mac": {
    "target": [
      {
        "target": "dmg",
        "arch": [
          "universal"
        ]
      }
    ]
  }
}
```
:::

and use
```
build -wl
```

### TargetConfiguration
* **<code id="TargetConfiguration-target">target</code>** String - The target name. e.g. `snap`.
* <code id="TargetConfiguration-arch">arch</code> "x64" | "ia32" | "armv7l" | "arm64" | "universal" - The arch or list of archs.
