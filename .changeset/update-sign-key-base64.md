---
"builder-util": major
"app-builder-lib": major
"electron-builder": major
---

feat(signing)!: `ELECTRON_BUILDER_UPDATE_SIGN_KEY` takes the PEM file base64-encoded on one line, so CI systems such as GitLab can mask it (#10344) — encode it with `base64 < update-private-key.pem | tr -d '\n'`, and for key rotation concatenate the PEM files and encode them once (`cat old.pem new.pem | base64 | tr -d '\n'`). BREAKING for the 27.0.0 alphas: a raw PEM, or any value that is not the standard base64 of complete PEM private keys (quoted, URL-safe, truncated, separately encoded keys joined together), now fails with an `InvalidConfigurationError` that never prints the value, and invalid or duplicate signing keys from any source are reported as an `InvalidConfigurationError` too; `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` and `updateManifest.signingKey` / `signingKeyFile` still take PEM, and `electron-builder create-update-key` prints the encode command for the key file it writes.
