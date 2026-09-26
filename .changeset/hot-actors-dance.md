---
"electron-updater": major
---

refactor(updater): change Nsis VerifyUpdateCodeSignature interface to return an unambiguously readable result, instead of `null | string`

feat(updater): add verifyUpdateFile method to AppUpdater, allowing to specify a custom logic for verification of the downloaded update file binary, and abort the download in case of failure

Action is needed only if you manually override `verifyUpdateCodeSignature` on `NsisUpdater`:
- result `null` changed to `{ success: true }`
- result `error string` changed to `{ success: false, error: 'error string' }`
