---
"app-builder-lib": patch
---

feat: support fully offline (air-gapped) Electron downloads by picking up a locally seeded `SHASUMS256.txt-<version>` at the Electron cache root and passing it to `@electron/get` as inline checksums, suppressing the mandatory network fetch of `SHASUMS256.txt` that failed air-gapped builds even with a fully seeded cache (#10039)
