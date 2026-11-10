---
"app-builder-lib": patch
---

fix(mac): a custom `mac.sign` signer is called also when no keychain identity is found (with no identity, and a log line saying so); for a MAS app, whose installer needs a keychain identity, it is skipped with a warning unless `forceCodeSigning` is set. And `mas.forceCodeSigning` / `masDev.forceCodeSigning` apply to the `mas` / `mas-dev` targets, cascading over `mac` like every other option.
