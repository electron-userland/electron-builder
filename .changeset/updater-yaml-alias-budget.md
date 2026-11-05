---
"electron-updater": major
---

fix(updater)!: reject an update manifest whose YAML aliases expand to more than 100000 values, keys and string characters (or more than the length of a larger file) with `ERR_UPDATER_INVALID_UPDATE_INFO`, so comparing or serializing the update info cannot freeze the app. electron-updater 6 accepted such a manifest; manifests electron-builder writes contain no aliases and are unaffected, but one that another tool writes or rewrites with aliases (e.g. js-yaml `dump` without `noRefs`) stops updating installs: write it without aliases or with the shared values repeated inline. The error links the migration guide, and the first rejection logs a warning once per updater. Private GitHub repositories parse their manifest the same way as the other providers, and the Bitbucket and Keygen providers report a manifest they cannot parse with `ERR_UPDATER_INVALID_UPDATE_INFO` (was `ERR_UPDATER_LATEST_VERSION_NOT_FOUND`). The `ERR_UPDATER_INVALID_UPDATE_INFO` messages name the channel file URL without its query string, so a token in the feed URL is not logged.

See https://www.electron.build/docs/migration/v27-runtime-changes#update-manifest-yaml-aliases-are-limited
