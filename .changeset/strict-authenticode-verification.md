---
"electron-updater": major
"builder-util-runtime": minor
"app-builder-lib": patch
---

feat(updater)!: Windows update signature verification fails closed — electron-updater installs an NSIS update only when PowerShell (`Get-AuthenticodeSignature`) verifies it: an update it cannot verify (PowerShell cannot be started or run, times out, or prints unreadable output) is rejected with `ERR_UPDATER_SIGNATURE_UNVERIFIABLE`, and a Windows catalog signature is rejected as invalid unless the app opts in with the new `NsisUpdater.allowCatalogSignature` (default `false`; when `true`, a valid catalog signature is accepted with a warning only when its signer matches `publisherName`). PowerShell is started by absolute path, the installer path is passed in an environment variable, and non-ASCII output is escaped instead of setting a console encoding, so verification works under PowerShell Constrained Language Mode (fixing 7.0.0-alpha.8 to alpha.10). The build-time installer check uses the same invocation. builder-util-runtime adds `prepareAuthenticodeSignatureExec` and `POWERSHELL_ASCII_ESCAPE_FUNCTION`. Migration: where PowerShell may be blocked (AppLocker / WDAC), assign a native `verifyUpdateFileAuthenticodeSignature` in your first electron-updater 7 release — see https://www.electron.build/docs/migration/v27-breaking-changes#windows-update-signature-verification-fails-closed
