---
"app-builder-lib": minor
---

feat(mac): embed the Electron 41+ ASAR integrity digest into the Electron Framework (signed again ad hoc afterwards), so with the `enableEmbeddedAsarIntegrityValidation` fuse the `ElectronAsarIntegrity` hashes in `Info.plist` can't be changed to match a modified `app.asar`; on by default, `mac.asarIntegrityDigest: false` opts out (#9648)
