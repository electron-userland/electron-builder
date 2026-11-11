---
"electron-updater": patch
---

fix(updater): with `allowPrerelease`, private GitHub repositories now pick the highest release eligible for the current channel, as public GitHub repositories do, instead of the first pre-release in the API list, so a pre-release user gets a newer stable release, a beta user is not offered alpha builds, and setting `channel` no longer installs an older pre-release; with a custom `tagNamePrefix`, tags without the prefix are skipped, and releases whose tags are not versions keep the list-order pick. On both public and private GitHub, a numbered pre-release (such as `1.0.1-1`) is no longer treated as a channel named `1`, so it is offered `1.0.1-2` and `1.0.1`. The channel's own channel file (such as `beta.yml`) is read when the release has it, and a release list with no eligible release, or a malformed `/releases/latest` response, fails with an `ERR_UPDATER_*` code instead of a `TypeError`
