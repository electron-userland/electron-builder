---
"electron-updater": patch
---

fix: when a server rejects multi-range requests (GitHub release assets answer 501, Google Cloud Storage 400, S3 the whole file with 200), retry the differential download with one range per request instead of downloading the full update. Every range response must now be a 206 for exactly the requested range: a host that ignores ranges used to stream the whole file once per range before the checksum failed, and now fails on its first request and falls back to a full download.
