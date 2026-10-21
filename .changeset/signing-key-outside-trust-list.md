---
"app-builder-lib": major
"electron-builder": major
---

feat(signing)!: fail the build when the signing key isn't in `updateManifest.publicKey`

BREAKING CHANGE: when `updateManifest.publicKey` is set explicitly and none of the keys the build signs update
manifests with is in it, a publishing build now fails at build start, before anything is packed or uploaded, with an
`InvalidConfigurationError` naming the key ids of the signing keys and of the listed keys (never key material). Such
a release embeds no key it is signed with, so its installs would reject manifests signed with the current key(s).
This was a warning before; a build without a publish policy still only warns. For a deliberate cutover release that
is signed with the old key but embeds only the new one, set the new `updateManifest.allowSigningKeyOutsideTrustList:
true` (explicit config only) to keep the warning. Nothing changes when `publicKey` is not set, since the trust list is
then derived from the signing keys. See the v27 breaking changes guide.
