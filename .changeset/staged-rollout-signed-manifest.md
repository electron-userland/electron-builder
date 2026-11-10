---
"electron-updater": patch
---

fix(updater): when a signed update manifest with a `stagingPercentage` fails verification, say that `stagingPercentage` is covered by the signature and link the staged-rollout docs, which now explain how to sign `latest*.yml` again after changing it
