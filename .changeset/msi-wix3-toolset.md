---
"app-builder-lib": major
---

feat(msi): build `msi` and `msiWrapped` installers with WiX 3.14.1 (`toolsets.wix`), native arm64 MSIs (#10354)

BREAKING CHANGE: `toolsets.wix` unset or `"latest"` (= `"2.0.0"`) builds `msi` and `msiWrapped` installers with WiX 3.14.1, which produces a native `Arm64` MSI for `arm64` builds. `toolsets.wix: "0.0.0"` keeps the previous WiX 4.0.0.5512 preview bundle, which packages an arm64 app in an x64 MSI. The WiX 3 project uses the WiX 3 namespace, nested `Directory` elements (also for a nested `menuCategory`) and explicit ids for files in subdirectories; it keeps the upgrade code, install paths and file layout. An `msiProjectCreated` hook that inserts elements of a WiX 4 extension namespace must use the WiX 3 one (for example `http://schemas.microsoft.com/wix/UtilExtension`) or pin `"0.0.0"`; with WiX 3, a project that still declares a WiX 4 namespace after the hook fails the build with an `InvalidConfigurationError` that names it. A custom bundle (`{ url, checksum }`) must have the WiX 3 layout.
