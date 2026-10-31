---
"app-builder-lib": major
"electron-builder": major
---

feat(publish)!: `electron-builder publish -f` checks every update manifest (`latest*.yml`) before it uploads anything: an unsigned manifest is refused unless `updateManifest: false`, and with `updateManifest.publicKey` set the manifest must be signed by one of those keys (another key only with `allowSigningKeyOutsideTrustList`, which warns). Without `publicKey` it warns, and fails under `forceCodeSigning`. See https://www.electron.build/docs/migration/v27-build-changes#signed-update-manifests-are-required
