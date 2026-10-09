---
"app-builder-lib": patch
---

fix(mac): sign with the unique certificate hash, and keep MAS `ElectronTeamID` automation working

`codesign --sign` was given the certificate's common name, which fails with `ambiguous (matches "X" and "X" ...)` when the keychain holds more than one valid certificate with that name. It is now given the certificate's SHA-1 hash, which is unique.

`@electron/osx-sign` parses the Team ID out of the identity *name* to fill in `ElectronTeamID` for sandboxed (MAS) apps, so electron-builder now writes that key into the app's `Info.plist` itself before signing — the same value from the same source — instead of relying on the identity string carrying it. A custom signer replaces osx-sign entirely, so it keeps receiving the bare hash and its `Info.plist` is left untouched.

Also fixes `savePlistFile` destroying `<data>` and `<date>` values, which it rewrote as a `<dict>` of byte integers and an empty `<dict>` respectively.
