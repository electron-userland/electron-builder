---
"electron-updater": minor
---

feat: reject block maps that cannot be planned on. A block map (v2 or v3, separate or embedded) that is empty, describes a 0-byte file, does not end at the update's size or plans no data is rejected with one log line (`ERR_UPDATER_INVALID_BLOCKMAP`) and the update is downloaded in full. When the update manifest has a `blockMapSha512` for a file, the new block map (downloaded whole, or assembled from Range requests) is checked against it before it is used or cached
