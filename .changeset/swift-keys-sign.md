---
"app-builder-lib": patch
---

Add `codesign:` to the keychain key partition list so `/usr/bin/codesign` can use imported signing keys non-interactively, avoiding the recurring keychain-access prompt on macOS.
