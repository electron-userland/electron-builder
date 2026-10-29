---
"electron-updater": patch
---

perf(updater): fewer round trips for differential updates on single-range hosts. The first block map v3 request also covers the group table when it is small (up to ~2000 groups), record ranges up to 8 KiB apart are fetched as one range on hosts without multipart support, independent block map ranges are fetched up to 4 at a time, and the next small download ranges of the update are requested while earlier ones are written
