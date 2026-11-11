---
"electron-updater": patch
---

fix(updater): the `ERR_HTTP_RESPONSE_TOO_LARGE` error for a channel file (`latest*.yml`) larger than `maxUpdateInfoSize` links to https://www.electron.build/docs/migration/v27-runtime-changes#channel-files-are-limited-to-10-mib, which explains the 10 MiB default and how to raise it
