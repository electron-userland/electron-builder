---
"builder-util-runtime": major
"app-builder-lib": major
---

feat(updater): gate legacy top-level manifest `path`/`sha512` behind `electronUpdaterCompatibility`

BREAKING CHANGE: The legacy top-level `UpdateInfo.path` / `UpdateInfo.sha512` fields are now written to `latest*.yml` only when `electronUpdaterCompatibility` includes electron-updater 1.x – 2.15 clients (previously they were written unconditionally), mirroring how the Windows `sha2` field is already gated. Both fields are now optional on the `UpdateInfo` type. Modern clients read the `files[]` array and are unaffected. If you still ship apps that embed electron-updater 1.x – 2.15, set `electronUpdaterCompatibility` to a range that includes them so the legacy descriptor keeps being emitted.
