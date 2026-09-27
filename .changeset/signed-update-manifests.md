---
"builder-util-runtime": minor
"builder-util": minor
"app-builder-lib": minor
"electron-updater": minor
"electron-builder": minor
---

feat(security): signed update manifests (Ed25519) with trust lists and multi-signature manifests

Optional Ed25519 signing of auto-update manifests (`latest*.yml`). When signing keys are configured
(`updateManifest.signingKey`/`signingKeyFile` in config, or `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/`ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`
env vars), each manifest is signed over its integrity-critical fields and the matching public keys are
embedded into `app-update.yml` (both resolved from the same keys on the platform packager, so signing and
embedding cannot disagree). electron-updater verifies the signature before downloading and refuses to
update on tamper/missing-signature (fail-closed). Opt-in: when no public key is configured, verification is
skipped with a one-time warning. New CLI: `electron-builder create-update-key` (prints the public key and its key id).

Key rotation without a flag day: an install trusts a **list** of public keys (`updateManifestPublicKey` is a
string or an array; `updateManifest.publicKey`, `signingKey` and `signingKeyFile` accept arrays, a PEM value may
hold several concatenated keys, and `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` accepts several paths joined with
the OS path delimiter), and a manifest may carry **several signatures** (`signatures: [{ keyId, signature }]`,
one per signing key, next to the legacy `signature` of the first key). A manifest is accepted when any trusted
key validates any of its signatures, so a release signed with `[old, new]` verifies on installs that trust
either. `AppUpdater.updateManifestPublicKey` accepts a string or an array. A build-time warning flags an
explicit `publicKey` list that contains none of the signing keys.

Gating of the Linux package-manager signature-bypass flags landed separately as
`AppUpdater.allowUnverifiedLinuxPackages` (#9990).
