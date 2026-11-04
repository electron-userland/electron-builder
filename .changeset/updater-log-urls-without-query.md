---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): name update file, blockmap and request URLs without their query in logs and error messages (`Found version`, `Downloading update from`, the block map lines, the Squirrel.Mac proxy's `fileToProxy` and the API request error messages), since a query can hold a pre-signed URL's signature or a feed token
