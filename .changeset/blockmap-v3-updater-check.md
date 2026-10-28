---
"app-builder-lib": patch
---

fix(blockmap): check the app's electron-updater against the `electronUpdaterCompatibility` of every platform the build targets, instead of passing when any declared range includes it (e.g. `win.electronUpdaterCompatibility: ">=6"` no longer lets a macOS build with the default `>=7` write binary block maps for an app on electron-updater 6). Where the build writes binary block maps, electron-updater 7.0.0-alpha.0 to 7.0.0-alpha.12, which cannot read them, fail the build; an electron-updater bundled from `devDependencies` is checked like one in `dependencies`. An NSIS installer with a JSON (`"v2"`) block map no longer reads the asar and 7z archive headers that only the binary (`"v3"`) map uses.
