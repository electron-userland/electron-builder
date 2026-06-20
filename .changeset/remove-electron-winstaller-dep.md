---
"electron-builder-squirrel-windows": major
---

feat(squirrel-windows)!: inline installer logic; remove electron-winstaller dependency and its vendored binaries

BREAKING: the `squirrelWindows.customSquirrelVendorDir` option has been removed. Override the vendor toolset source with the `ELECTRON_BUILDER_SQUIRREL_TOOLSET_DIR` environment variable instead (it goes through the same nuget/rcedit provisioning).
