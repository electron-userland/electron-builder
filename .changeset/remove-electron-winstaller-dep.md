---
"electron-builder-squirrel-windows": major
---

feat(squirrel-windows)!: inline installer logic; remove electron-winstaller dependency and its vendored binaries

BREAKING: the `squirrelWindows.customSquirrelVendorDir` option has been removed. Supply a custom Squirrel vendor bundle with the `toolsets.squirrel` config (a `ToolsetCustom` object) instead — it goes through the same nuget/rcedit provisioning as the default bundle.
