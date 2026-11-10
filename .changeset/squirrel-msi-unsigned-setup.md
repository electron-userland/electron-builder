---
"app-builder-lib": major
"electron-builder-squirrel-windows": major
---

feat(squirrel)!: `squirrelWindows.msi: true` warns that the MSI Squirrel.Windows builds embeds `Setup.exe` before electron-builder signs it, and fails under `forceCodeSigning`, pointing at the `msi` target for a signed MSI. See https://www.electron.build/docs/migration/v27-build-changes#forcecodesigning-covers-notarization-and-update-manifests
