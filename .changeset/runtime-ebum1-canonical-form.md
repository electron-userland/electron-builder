---
"builder-util-runtime": patch
---

fix: keep `files[].blockMapSha512` out of the signed update manifest payload, so a signed manifest that carries it verifies in every electron-updater that checks signatures, including the versions that predate the field
