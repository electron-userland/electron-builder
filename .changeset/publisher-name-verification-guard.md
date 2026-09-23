---
"electron-updater": minor
"app-builder-lib": minor
---

feat: warn on silently skipped update signature verification and validate `publisherName` against the signing certificate at build time

Two guards around Windows update signature verification:

- **electron-updater**: when `app-update.yml` exists but contains no `publisherName`, the updater used to skip signature verification (including custom `verifyUpdateCodeSignature` hooks) completely silently. It now logs a warning explaining that verification was skipped, how to fix it (sign the build so `publisherName` is derived automatically, or set `win.publisherName` explicitly), and that this fail-open behavior is deprecated: electron-builder v28 will treat a missing `publisherName` as a verification failure (fail-closed). The no-`app-update.yml` path (unpackaged/dev mode) stays silent.
- **app-builder-lib**: when `publisherName` is explicitly configured and the subject of the local code signing certificate is known, the build now fails with a clear error if none of the configured names match the certificate (same DN-subset/CN matching semantics as the updater's verifier; any one of multiple configured names matching passes, so certificate-rotation setups keep working). This catches signing with the wrong certificate at build time instead of at update time. The check is skipped whenever the actual signing certificate's subject is not genuinely known (custom `sign` hooks, Azure Trusted Signing, PKCS#11 without an extractable certificate, x509 files without a CN), and `publisherName: null` remains a pure opt-out.
