---
"electron-updater": patch
---

feat: the first update after an app switches its `.blockmap` format (e.g. from `"v2"` to `"v3"`) is differential instead of a full download. Both formats cut the same blocks with the same blake2b digest, and a v2 map stores the digest whose first 8 bytes are the v3 block hash, so the cached map of one format is compared with the new map of the other by those bytes, without reading or re-hashing the installed file. A v2 map whose checksums are not those digests still falls back to a full download (`ERR_UPDATER_BLOCKMAP_FORMAT_CHANGED`, logged once at `info`)
