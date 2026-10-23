---
"app-builder-lib": patch
---

fix(win): sign `.msi` with SHA-256 by default. An MSI holds a single signature, and electron-builder picked SHA-1 for it unless `signingHashAlgorithms` explicitly left SHA-1 out, so the default configuration (`["sha1", "sha256"]`) produced SHA-1-only signed MSIs. Now an MSI is signed with SHA-256 unless SHA-1 is the only algorithm listed. To keep the previous behaviour, set `signingHashAlgorithms: ["sha1"]`. Executables are still dual-signed by default. Because an MSI now takes the SHA-256 path, signtool timestamps it via RFC 3161 (`/tr rfc3161TimeStampServer /td sha256`) instead of the legacy `/t timeStampServer`, and a custom `win.sign` hook now receives `hash: "sha256"` for `.msi` files. Signing with an empty `signingHashAlgorithms` list now fails with an `InvalidConfigurationError` instead of running no signing pass and reporting the file as signed.
