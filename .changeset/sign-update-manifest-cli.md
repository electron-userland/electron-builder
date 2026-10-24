---
"app-builder-lib": minor
"electron-builder": minor
"builder-util": minor
---

feat: add `electron-builder sign-update-manifest <files..>` to re-sign an edited `latest*.yml` in place without rebuilding — it validates the manifest shape, drops the old `signature`/`signatures`, signs with the key(s) from `--key-file` or `ELECTRON_BUILDER_UPDATE_SIGN_KEY(_FILE)` and keeps every other field; `--verify` / `--public-key` check existing signatures without writing. A missing key fails with an `InvalidConfigurationError`, and the private key is never printed.
