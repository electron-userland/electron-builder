---
"electron-updater": minor
---

feat: harden the block map download path. A block map (v2 or v3, separate or embedded) that is empty, describes a 0-byte file, does not end at the update's size or plans no data is rejected with one log line and the update is downloaded in full. Block maps are bounded by the size of the file they describe (1 MiB + 64 bytes per KiB, at most 128 MiB) before they are downloaded, decompressed or allocated, so a gzip bomb or a hostile v3 header cannot exhaust memory. When the update manifest has a `blockMapSha512` for a file, the new block map (downloaded whole, or assembled from Range requests) is checked against it before it is used or cached
