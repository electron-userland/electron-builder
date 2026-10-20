---
"app-builder-lib": patch
---

fix(mac): keep an explicit `NSAllowsArbitraryLoads` from `mac.extendInfo`. Before, electron-builder always set `NSAppTransportSecurity.NSAllowsArbitraryLoads` to `true` on non-MAS builds, after `extendInfo` was merged, so an app could not turn it off. After, it is set to `true` only when the app has not set it; the local-networking and `localhost`/`127.0.0.1` exceptions that electron-updater's proxy needs are still added.
