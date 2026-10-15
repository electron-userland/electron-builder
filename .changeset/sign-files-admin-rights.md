---
"builder-util-runtime": patch
"builder-util": patch
"app-builder-lib": patch
"electron-updater": patch
---

fix(updater): the update manifest signature now covers `files[].isAdminRightsRequired`, the flag electron-updater uses to decide whether to run the NSIS installer through `elevate.exe`. It is signed in a new `EBUM2` canonical payload (`EBUM1` plus a fixed five-column `file:` record: `url`, `sha512`, `size`, `blockMapUrl`, flag), and the shape check requires the flag to be a boolean when present. electron-builder now signs every manifest twice with each key: the `EBUM1` signatures exactly as before (legacy `signature` plus the first `signatures` entries), so installs on electron-updater 7.0.0-alpha.8/alpha.9 keep updating, followed by one `EBUM2` entry per key. electron-updater verifies `EBUM2`. During the v27 pre-release it still accepts a manifest with only an `EBUM1` signature (as written by electron-builder 27.0.0-alpha.9/alpha.10) when nothing in it has `isAdminRightsRequired: true`, and warns once with what to do; a per-machine manifest with only an `EBUM1` signature is refused with `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`, asking to rebuild and re-sign with a matching electron-builder. The fallback is removed before 27.0.0 stable. See https://www.electron.build/docs/migration/v27-breaking-changes#update-manifests-are-signed-in-the-ebum2-format
