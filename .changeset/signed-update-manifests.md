---
"builder-util-runtime": minor
"builder-util": minor
"app-builder-lib": major
"dmg-builder": minor
"electron-updater": minor
"electron-builder": major
---

feat(security)!: signed update manifests (Ed25519) are required by default, with trust lists and multi-signature manifests

BREAKING CHANGE: signing auto-update manifests is now REQUIRED by default. A build with a publish policy
(`--publish`) that includes a target writing auto-update metadata (`latest*.yml`: NSIS, AppImage, deb/rpm/pacman,
macOS zip/dmg, AppX with `electronUpdaterAware`) fails when no Ed25519 signing key resolves. The check runs at build
start, before anything is packed or uploaded, so no artifact of that build is published; a build of only targets
that write no update info (snap, flatpak, MSI/MSIX, portable, mas/pkg, plain archives) needs no key. Third-party
targets declare update info with the new `Target.writesUpdateInfo` getter; one that does not is still checked, but
only when its own artifact is created. The error names `electron-builder create-update-key` and the
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

`app-update.yml` (the embedded feed and trust list) now follows the targets that write update info: each packaged
app embeds the first provider of the publish settings of its manifest-emitting targets (NSIS/NSIS web, AppX with
`electronUpdaterAware`, macOS dmg/zip, AppImage, deb/rpm/pacman), resolving target, then platform, then top level,
instead of the platform/top-level `publish` only. A build with only `nsis.publish` therefore ships that feed and
the key verifying its signed manifests, where it used to ship no `app-update.yml` (or, with a GitHub `repository`,
a GitHub feed while the manifests went elsewhere). With no such target (snap-only, `publish: null` or
`publishAutoUpdate: false` on the target) the platform/top-level settings apply as before, including the GitHub
fallback. AppImage and deb/rpm/pacman honor `appImage.publish`/`deb.publish` etc. for the file they write. When two
targets built from the same app (e.g. `dmg` and `zip`, or `nsis` and an updater-aware `appx`) resolve different
first providers, a publishing build fails at build start with an `InvalidConfigurationError`; a build without a
publish policy warns that publishing will fail and writes no `app-update.yml` for that app. Configure `publish` once
at the platform level, or give those targets the same first provider. `getAppUpdatePublishConfiguration` now
honors the target-specific options passed to it.

Gating of the Linux package-manager signature-bypass flags landed separately as
`AppUpdater.allowUnverifiedLinuxPackages` (#9990).
