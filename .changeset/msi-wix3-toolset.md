---
"app-builder-lib": minor
---

feat(msi): build `msi` and `msiWrapped` installers with WiX 3.14.1 (`toolsets.wix`, `"latest"` = `"2.0.0"`), which produces a native `arm64` MSI for `arm64` builds (#10354); `toolsets.wix: "0.0.0"` keeps the previous WiX 4.0.0.5512 preview bundle, which packages an arm64 app in an x64 MSI. The WiX 3 project uses the WiX 3 namespace, nested `Directory` elements and explicit ids for files in subdirectories, and has the same component GUIDs, install paths and upgrade code as before. An `msiProjectCreated` hook that inserts elements of a WiX 4 extension namespace must use the WiX 3 one (for example `http://schemas.microsoft.com/wix/UtilExtension`) or pin `"0.0.0"`. A custom bundle (`{ url, checksum }`) must have the WiX 3 layout.
