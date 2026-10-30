---
"electron-updater": patch
---

fix(updater): with `allowPrerelease`, private GitHub repositories now pick the highest release eligible for the current channel, as public GitHub repositories do, instead of the first pre-release in the API list, so a pre-release user gets a newer stable release, a beta user is not offered alpha builds, and setting `channel` no longer installs an older pre-release; the channel's own channel file (such as `beta.yml`) is read when the release has it, and a release list with no eligible release fails with `ERR_UPDATER_NO_PUBLISHED_VERSIONS` instead of a `TypeError`
