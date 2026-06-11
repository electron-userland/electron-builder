---
"builder-util-runtime": minor
"builder-util": minor
"app-builder-lib": minor
"electron-updater": minor
"electron-builder": minor
---

feat(security): signed update manifests (Ed25519) and gated Linux unsigned-package installs

A1 — Optional Ed25519 signing of auto-update manifests (`latest*.yml`). When a signing key is configured
(`updateManifest.signingKey`/`signingKeyFile` in config, or `EP_UPDATE_SIGN_KEY`/`EP_UPDATE_SIGN_KEY_FILE`
env vars), each manifest is signed over its integrity-critical fields and the matching public key is
embedded into `app-update.yml`. electron-updater verifies the signature before downloading and refuses to
update on tamper/missing-signature (fail-closed). Opt-in: when no public key is configured, verification is
skipped with a one-time warning. New CLI: `electron-builder create-update-key`.

A2 — `LinuxUpdater.requireSignedLinuxPackages` (default `false`) gates the package-manager flags that bypass
distro signature checks (`--allow-unauthenticated`, `--nogpgcheck`, `--allow-unsigned-rpm`, rpm `--nodeps`).
When `false`, those flags are kept but a warning is logged (artifact integrity is still enforced via the
manifest sha512); when `true`, they are omitted so the package manager enforces its own signatures.
