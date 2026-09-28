---
"builder-util-runtime": minor
"builder-util": minor
"app-builder-lib": major
"electron-updater": minor
"electron-builder": major
---

feat(security): signed update manifests (Ed25519) with trust lists and multi-signature manifests

Ed25519 signing of auto-update manifests (`latest*.yml`). When signing keys are configured
(`updateManifest.signingKey`/`signingKeyFile` in config, or `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/`ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`
env vars), each manifest is signed over its integrity-critical fields and the matching public keys are
embedded into `app-update.yml` (both resolved from the same keys on the platform packager, so signing and
embedding cannot disagree). electron-updater verifies the signature before downloading and refuses to
update on tamper/missing-signature (fail-closed). Installs built before a public key existed keep skipping
verification with a one-time warning. New CLI: `electron-builder create-update-key` (prints the public key and its key id).

BREAKING CHANGE: signing is REQUIRED by default. A build with a publish policy that emits auto-update metadata
(`latest*.yml`, or the `app-update.yml` written into the app) fails when no Ed25519 key resolves, naming
`electron-builder create-update-key` and the environment variables in the error; a build without a publish policy
warns instead, so local builds are unaffected. Set `updateManifest: false` - the only opt-out - to publish unsigned
manifests; every build that emits a manifest then logs a warning. `false` also short-circuits
`ELECTRON_BUILDER_UPDATE_SIGN_KEY`, so a leftover CI secret cannot re-enable signing behind the opt-out. A platform
block may be `false` on its own and shadows a root signing config for that platform, while a platform `null` still
falls back to the root. The requirement is waived for a publish target with `publishAutoUpdate: false`, which emits
no manifest, and a `publicKey` with no private key does not satisfy it. Because installs that carry a public key are
fail-closed, do not switch to `updateManifest: false` after shipping signed manifests - those installs would refuse
every further update. Note that `getAppUpdatePublishConfiguration` (exported for third-party targets) can now throw
for this reason.

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
