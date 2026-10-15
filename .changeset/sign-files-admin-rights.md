---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): the update manifest signature now covers `files[].isAdminRightsRequired`, the flag electron-updater uses to decide whether to run the NSIS installer through `elevate.exe`. Previously a mirror could add or remove it on a signed manifest without breaking verification. The flag is signed only when `true` (as a fixed fifth column on the file record, after an empty `blockMapUrl` column when there is none), so manifests without it canonicalize and verify exactly as before, and the shape check now requires it to be a boolean when present. Per-machine NSIS manifests (which carry the flag) signed by an earlier 27.0.0-alpha builder no longer verify with this electron-updater, and vice versa: rebuild and re-sign them, and ship the updater and builder together.
