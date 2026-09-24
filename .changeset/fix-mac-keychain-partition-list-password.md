---
"app-builder-lib": patch
---

fix(mac): pass the temporary keychain's own password to `security set-key-partition-list -k` instead of the certificate's import password. The import password is only valid for `security import -P`; `set-key-partition-list` authenticates against the keychain itself, so on macOS versions that verify the password, `CSC_LINK`-based signing failed with `SecKeychainUnlock: The user name or passphrase you entered is not correct` (see #10066).
