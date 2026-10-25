---
"app-builder-lib": major
"dmg-builder": major
"electron-builder": major
---

feat(signing)!: `forceCodeSigning` verifies signatures and fails when notarization, update-manifest signing or any signing step is skipped (also on pull-request builds), signed update manifests are read back before they are written, and the new `electron-builder verify` command checks built output (#10429). See https://www.electron.build/docs/migration/v27-build-changes#forcecodesigning-covers-notarization-and-update-manifests
