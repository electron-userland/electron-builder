---
"electron-updater": patch
---

fix(updater): make GitHubProvider pick the newest available release if `allowPrerelease=true` but current version is stable

- `allowPrerelease=true` with no explicit channel and a stable current version now selects the newest valid semver release in the Atom feed (skipping unrelated non-semver tags such as other packages in a monorepo) instead of blindly taking the first feed entry (#9894).
- When every published release is older than the installed version, the updater now reports "update not available" gracefully (and honors `allowDowngrade`) instead of throwing.
- `allowPrerelease=false` no longer throws `ERR_UPDATER_NO_PUBLISHED_VERSIONS` when the latest release tag (from `/releases/latest`) is absent from GitHub's truncated Atom feed; it proceeds with the resolved tag.
- Harden the release download path against path traversal: a tag containing `.`/`..` path segments is rejected with `ERR_UPDATER_INVALID_TAG`.
