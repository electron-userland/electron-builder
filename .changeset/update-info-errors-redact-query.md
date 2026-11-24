---
"electron-updater": patch
---

fix(updater): the `ERR_UPDATER_ZIP_FILE_NOT_FOUND`, `ERR_UPDATER_NO_CHECKSUM` and `ERR_UPDATER_NO_FILES_PROVIDED` errors name the update files by URL without the query (which can hold a pre-signed URL's signature or a feed token), instead of dumping the update info
