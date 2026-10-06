---
"builder-util-runtime": minor
"electron-updater": minor
---

feat(updater): optional `files[].blockMapUrl` in `latest*.yml` names a file's blockmap URL (e.g. a separately pre-signed one) instead of `${url}.blockmap` with the file URL's query string. A relative value resolves like `url` (against the feed URL); an absolute URL is used as-is, with its own host and query string. It gets the feed query and credential headers only on the feed's origin. With a `blockMapUrl`, the old blockmap is not derived from the new file's URL: it comes from the local cache, else from `previousBlockmapBaseUrlOverride`, else that update is downloaded in full (which caches the new blockmap). The manifest signature covers `blockMapUrl` when present, as an extra field on the file record, so manifests without it canonicalize and verify exactly as before; an electron-updater without this change refuses a signed manifest that has one. electron-builder does not write it. The private GitHub and GitLab providers, which resolve files from the release assets, ignore it.
