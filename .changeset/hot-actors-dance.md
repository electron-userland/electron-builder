---
"electron-updater": major
---

refactor(updater): change Nsis VerifyUpdateCodeSignature interface to return an unambiguously readable result, instead of `null | string`

Action is needed only if you manually override `verifyUpdateCodeSignature` on `NsisUpdater`:
- result `null` changed to `{ success: true }`
- result `error string` changed to `{ success: false, error: 'error string' }`
