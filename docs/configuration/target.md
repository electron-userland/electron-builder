Without target configuration, electron-builder builds Electron app for current platform and current arch using default target.

* macOS - DMG and ZIP for Squirrel.Mac.
* Windows - [NSIS](nsis.md).
* Linux - AppImage.

Platforms and archs can be configured or using [CLI args](https://github.com/electron-userland/electron-builder#cli-usage), or in the configuration. 

For example, if you don't want to pass `--ia32` and `--x64` flags each time, but instead build by default NSIS target for all archs for Windows:

```json
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
```

and use
```sh
build -wl
```

## TargetConfiguration
<!-- do not edit. start of generated block -->
* **<code id="TargetConfiguration-target">target</code>** String - The target name. e.g. `snap`.
* <code id="TargetConfiguration-arch">arch</code> Array&lt;"x64" | "ia32" | "armv7l"&gt; | "x64" | "ia32" | "armv7l" - The arch or list of archs.
<!-- end of generated block -->