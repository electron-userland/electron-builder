---
"electron-updater": patch
---

fix(updater): electron-updater requires js-yaml `^4.3.2` (GHSA-2883-xcg3-v3hh, GHSA-5p4m-2wfm-xmqj, GHSA-52cp-r559-cp3m), so a channel file (`latest*.yml`) full of YAML merge keys, which is parsed before its signature is checked, is rejected quickly with `ERR_UPDATER_INVALID_UPDATE_INFO`
