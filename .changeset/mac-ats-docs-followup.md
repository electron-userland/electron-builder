---
"app-builder-lib": patch
---

docs(mac): say that Electron's default `Info.plist` already enables `NSAllowsArbitraryLoads` and that only an explicit `false` in `extendInfo` turns it off (`null` doesn't remove the key); follow-up to #10353.
