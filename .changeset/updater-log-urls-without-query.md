---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): name update file, blockmap and request URLs without their query in logs and error messages (`Found version`, `Downloading update from`, `Differential download`, the block map lines, the Squirrel.Mac proxy's `fileToProxy`, the API request error messages and the GitHub, private GitHub and GitLab providers' release and channel file errors), since a query can hold a pre-signed URL's signature or a feed token
