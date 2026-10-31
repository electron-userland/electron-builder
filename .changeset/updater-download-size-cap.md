---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): stop a full update download once it receives more bytes than the file's `size` in the update info (`ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED`), instead of writing whatever the server sends to disk before the checksum is compared
