---
"app-builder-lib": patch
---

fix(appimage): resolve a `toolsets.appimage` version pin to exactly that release instead of letting any pin other than `"1.0.3"` float to the newest bundle, and reject unknown versions with an `InvalidConfigurationError` rather than downloading without a checksum
