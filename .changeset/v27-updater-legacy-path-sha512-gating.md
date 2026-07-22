---
"builder-util-runtime": major
"app-builder-lib": major
---

feat(updater): gate legacy top-level manifest `path`/`sha512` behind `electronUpdaterCompatibility`

BREAKING CHANGE: The legacy top-level `UpdateInfo.path` / `UpdateInfo.sha512` fields are now written to `latest*.yml` only when the declared `electronUpdaterCompatibility` semver range intersects electron-updater versions `<2.16.0` (previously they were written unconditionally), mirroring how the Windows `sha2` field is gated; the legacy `latest-mac.json` is likewise emitted only when the range intersects `<2.0.0`. The default `electronUpdaterCompatibility` is now `>=2.16` (previously `>=2.15`), so none of the legacy fields are emitted by default. Both fields are now optional on the `UpdateInfo` type. Modern clients (electron-updater >=2.16) read the `files[]` array and are unaffected. If you still ship apps that embed electron-updater 1.x – 2.15, set `electronUpdaterCompatibility` to a range that includes them (e.g. `>=1.0.0`) so the legacy descriptor keeps being emitted.
