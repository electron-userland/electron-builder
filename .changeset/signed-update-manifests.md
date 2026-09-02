---
"builder-util-runtime": minor
"builder-util": minor
"app-builder-lib": minor
"electron-updater": minor
"electron-builder": minor
---

feat(security): signed update manifests (Ed25519)

Optional Ed25519 signing of auto-update manifests (`latest*.yml`). When a signing key is configured
(`updateManifest.signingKey`/`signingKeyFile` in config, or `EP_UPDATE_SIGN_KEY`/`EP_UPDATE_SIGN_KEY_FILE`
env vars), each manifest is signed over its integrity-critical fields and the matching public key is
embedded into `app-update.yml` (both resolved from a single key on the platform packager, so signing and
embedding cannot disagree). electron-updater verifies the signature before downloading and refuses to
update on tamper/missing-signature (fail-closed). Opt-in: when no public key is configured, verification is
skipped with a one-time warning. New CLI: `electron-builder create-update-key`.

Gating of the Linux package-manager signature-bypass flags landed separately as
`AppUpdater.allowUnverifiedLinuxPackages` (#9990).
