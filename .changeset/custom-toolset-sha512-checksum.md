---
"app-builder-lib": minor
---

feat(toolsets): accept a base64 SHA-512 checksum for custom toolsets and verify local `file://` archives

`toolsets.<name>.checksum` now accepts the base64-encoded SHA-512 of the archive (88 characters, e.g. `openssl dgst -sha512 -binary <archive> | openssl base64 -A`, the format v26 `customNsisBinary` configs used) as well as the SHA-256 hex. `@electron/get` verifies only SHA-256 hex, so a SHA-512 download is verified by electron-builder before it is cached or extracted, and a corrupted download is deleted. A local `file://` archive is now verified against its checksum before it is extracted; on a mismatch the build fails with a configuration error naming the file and both checksums, and the file is left in place. Prefixed values (`sha256:…`, `sha512-…`) and a hex-encoded SHA-512 are still rejected before anything is downloaded. See https://www.electron.build/docs/toolsets#custom-toolset-checksum
