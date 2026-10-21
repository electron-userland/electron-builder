---
"electron-updater": major
---

feat(win)!: the default Authenticode verification of NSIS updates accepts an update only when a `publisherName` entry that is the certificate subject distinguished name (DN) including `CN` and `O` (e.g. `"CN=My Company, O=My Company, C=US"`) matches its signer: a bare name or a DN with the `CN` only, which used to match the signer's Common Name with a warning, never matches. Such an entry (from an `app-update.yml` written by electron-builder before v27, a `dev-app-update.yml` or a direct call of `verifyUpdateFileAuthenticodeSignature`) is warned about once per updater, and the `ERR_UPDATER_INVALID_SIGNATURE` failure names it. Build the app with electron-builder v27, which writes such a DN. See https://www.electron.build/docs/migration/v27-breaking-changes#windows-publishername-must-be-a-distinguished-name
