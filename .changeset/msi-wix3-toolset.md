---
"app-builder-lib": minor
---

feat(msi): add `toolsets.wix` (#10354). `"2.0.0"` (or `"latest"`) builds `msi` and `msiWrapped` installers with WiX 3.14.1, which produces a native `arm64` MSI for `arm64` builds; unset or `"0.0.0"` keeps the current WiX 4.0.0.5512 preview bundle, which packages an arm64 app in an x64 MSI, so existing builds are unchanged. With WiX 3 the generated project uses the WiX 3 namespace, nested `Directory` elements and explicit ids for files in subdirectories; component GUIDs are the same as with the legacy bundle. A custom bundle (`{ url, checksum }`) must have the WiX 3 layout.
