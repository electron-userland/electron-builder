---
"electron-updater": patch
---

fix: keep the cached blockmap consistent with the cached installer. A download round that did not produce a new blockmap (e.g. the differential download was skipped because the cached installer was evicted) now removes the cached `current.blockmap` instead of leaving a stale one next to the freshly cached file, which poisoned the next differential download and surfaced as a generic sha512 checksum mismatch before falling back to a full download (#10097). Leftover pending blockmaps from previous update rounds are also cleared before a fresh download. sha512-mismatch logging now distinguishes a differential download that failed against stale/corrupt cached inputs (including whether the old blockmap came from the local cache or the server) from a genuine checksum failure of a fully downloaded file.
