---
"builder-util-runtime": major
"electron-updater": major
---

feat(updater): remove deprecated `versionInfo`; fix manifest hash-encoding sniffing

BREAKING CHANGE: Two changes to the auto-update path.

- `UpdateCheckResult.versionInfo` (a deprecated alias of `updateInfo`) has been removed. Use `updateInfo` instead.
- The updater no longer heuristically sniffs whether a manifest `sha512` is hex- or base64-encoded; it now always treats it as base64, which is what electron-builder emits. This removes a crafted-manifest mis-parsing vector.

SHA-256 (`sha2`) update checksums are intentionally not removed here — they remain accepted in v27 under the existing v28-removal grace period.
