---
"app-builder-lib": patch
---

fix: accept base64-encoded SHA-512 checksums for custom toolset downloads again. `customNsisBinary`/`customNsisResources` configs using the historically documented base64 SHA-512 checksums failed on 26.15.x with `Could not parse checksum file at line 1` because the checksum was forwarded to `@electron/get`, whose sumchecker only understands SHA-256 hex. Base64 SHA-512 checksums are now verified by electron-builder itself after the download (and on archive-cache hits); SHA-256 hex checksums keep being verified by `@electron/get`. Unrecognized or mixed checksum formats now fail fast with a clear configuration error instead of a mid-download parse error.
