---
"electron-updater": patch
"builder-util-runtime": patch
---

fix(updater): replace non-null assertions with explicit checks: an update without a file of the Linux package type fails with `ERR_UPDATER_UPDATE_FILE_NOT_FOUND`, an empty GitHub Atom feed response with `ERR_UPDATER_INVALID_RELEASE_FEED`, and a download with neither a destination nor a response handler with `ERR_UPDATER_DOWNLOAD_DESTINATION_NOT_SET`, instead of a `TypeError`
