---
"builder-util-runtime": patch
"builder-util": patch
"electron-publish": patch
"electron-updater": patch
---

fix: secrets in logs and error messages (passwords, tokens and keys in redacted command lines, environments and request options) are shown as a fingerprint keyed with a random secret of the process, derived with scrypt: the same value has the same fingerprint within a run, but a fingerprint cannot be checked against guessed values offline. A value whose fingerprint cannot be computed is shown as `<redacted>`.
