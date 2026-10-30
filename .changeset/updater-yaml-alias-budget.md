---
"electron-updater": patch
---

fix(updater): reject an update manifest whose YAML aliases expand to more than 100000 values, keys and string characters (or more than the length of a larger file) with `ERR_UPDATER_INVALID_UPDATE_INFO`, so comparing or serializing the update info cannot freeze the app; private GitHub repositories parse their manifest the same way as the other providers, and the Bitbucket and Keygen providers report a manifest they cannot parse with that code
