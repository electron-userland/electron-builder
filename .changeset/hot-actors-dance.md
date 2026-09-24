---
"electron-updater": minor
---

refactor(updater): rename Nsis verifyUpdateCodeSignature to verifyUpdateFileAuthenticodeSignature with a new interface that returns an unambiguously readable result, while keeping the old name and interface for backwards compatibility.

Action is recommended if you manually override `verifyUpdateCodeSignature` on `NsisUpdater` – that method is now deprecated, use `verifyUpdateFileAuthenticodeSignature` with following differences:
- result `null` changed to `{ response: "success" }`
- result `error string` changed to `{ response: "failure", message: 'error string' }`
