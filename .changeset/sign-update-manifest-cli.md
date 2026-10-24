---
"app-builder-lib": minor
"electron-builder": minor
"builder-util": minor
---

feat: add `electron-builder sign-update-manifest <files..>` to re-sign an edited `latest*.yml` in place without rebuilding. Like `publish` it reads the project configuration (`-c` / `--config`, including `-c.updateManifest.signingKeyFile=...` overrides) and signs with the key(s) the build would use — `updateManifest.signingKey` / `signingKeyFile` per platform, then `ELECTRON_BUILDER_UPDATE_SIGN_KEY(_FILE)` — after validating the manifest shape and dropping the old `signature`/`signatures`, keeping every other field; `--verify` checks the existing signatures against the trust list the build embeds without writing. A missing key fails with an `InvalidConfigurationError`, and key material is never printed. An unreadable signing key file now fails with an `InvalidConfigurationError` naming its source instead of a raw `ENOENT`.
