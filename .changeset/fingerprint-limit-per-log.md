---
"app-builder-lib": patch
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): a redacted log or error message holds at most 16 fingerprints of sensitive values (such as those in the JSON body or the headers of an error response); further sensitive values are logged as `<redacted>`. The publish configuration keys of the build fingerprint every sensitive value, so configurations that differ in any of them get their own publisher and update info file
