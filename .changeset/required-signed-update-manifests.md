---
"app-builder-lib": major
"electron-builder": major
---

feat(security)!: signed update manifests are required by default

A build with a publish policy that emits auto-update metadata now fails when no Ed25519 signing key resolves
(`electron-builder create-update-key`, then `ELECTRON_BUILDER_UPDATE_SIGN_KEY` / `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`
or `updateManifest.signingKey` / `signingKeyFile`); a build without a publish policy only warns. `updateManifest: false`
is the only opt-out - it publishes unsigned manifests with a warning and ignores the signing-key environment variables.
`updateManifest: null` is not an opt-out. See the v27 breaking changes guide.
