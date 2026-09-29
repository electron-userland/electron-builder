---
"builder-util-runtime": minor
"builder-util": minor
"app-builder-lib": major
"electron-updater": minor
"electron-builder": major
---

feat(security)!: signed update manifests (Ed25519) are required by default, with trust lists and multi-signature manifests

BREAKING CHANGE: signing auto-update manifests is now REQUIRED by default. A build with a publish policy
(`--publish`) that emits auto-update metadata (`latest*.yml`, or the `app-update.yml` written into the app) fails
when no Ed25519 signing key resolves; the error names `electron-builder create-update-key` and the
`ELECTRON_BUILDER_UPDATE_SIGN_KEY` / `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` environment variables
(`updateManifest.signingKey` / `signingKeyFile` work too). A build without a publish policy only warns, so local
builds are unaffected. To keep publishing unsigned manifests, set `updateManifest: false` - the only opt-out; every
build that emits a manifest then logs a warning, and `false` also short-circuits the signing-key environment
variables, so a leftover CI secret cannot re-enable signing behind the opt-out. `updateManifest: null` is not an
opt-out. A platform block may be `false` on its own and shadows a root signing config for that platform, while a
platform `null` still falls back to the root. `publishAutoUpdate: false` waives the requirement only when every
publish provider sets it (no manifest is emitted then); a single provider that still emits a manifest keeps it
enforced. A `publicKey` with no private key does not satisfy it. Because installs that carry a public key are
fail-closed, do not switch to `updateManifest: false` after shipping signed manifests - those installs would refuse
every further update. `getAppUpdatePublishConfiguration` (exported for third-party targets) can now throw for this
reason. See the v27 breaking changes guide.

Ed25519 signing of auto-update manifests (`latest*.yml`). Each manifest is signed over its integrity-critical fields
with the keys from `updateManifest.signingKey`/`signingKeyFile` or the `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/
`ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` env vars, and the matching public keys are embedded into `app-update.yml`
(both resolved from the same keys on the platform packager, so signing and embedding cannot disagree).
electron-updater verifies the signature before downloading and refuses to update on tamper/missing-signature
(fail-closed). Installs built before a public key existed keep skipping verification with a one-time warning. New
CLI: `electron-builder create-update-key` (prints the public key and its key id).

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
