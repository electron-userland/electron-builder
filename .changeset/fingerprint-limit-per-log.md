---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): a redacted log or error message holds at most 16 fingerprints of sensitive values (such as those in the JSON body or the headers of an error response); further sensitive values are logged as `<redacted>`
