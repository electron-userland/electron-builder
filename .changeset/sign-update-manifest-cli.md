---
"app-builder-lib": minor
"electron-builder": minor
"builder-util": minor
---

feat: add `electron-builder sign-update-manifest <files..>` to re-sign an edited `latest*.yml` in place without rebuilding. Like `publish` it reads the project configuration (`-c` / `--config`, including `-c.updateManifest.signingKeyFile=...` overrides) and signs with the key(s) the build would use — `updateManifest.signingKey` / `signingKeyFile` per platform, then `ELECTRON_BUILDER_UPDATE_SIGN_KEY(_FILE)` — refusing, like a publishing build, signing keys outside an explicit `updateManifest.publicKey` unless `allowSigningKeyOutsideTrustList` is set, after validating the manifest shape and dropping the old `signature`/`signatures`, keeping every other field; `--verify` checks the existing signatures without writing, with the same check and outcomes as `electron-builder verify` (against `updateManifest.publicKey`, honoring `updateManifest: false` and `allowSigningKeyOutsideTrustList`, and never loading a signing key). A missing key fails with an `InvalidConfigurationError`, and key material is never printed. An unreadable signing key file now fails with an `InvalidConfigurationError` naming its source instead of a raw `ENOENT`.
