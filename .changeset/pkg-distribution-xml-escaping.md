---
"app-builder-lib": patch
---

fix(pkg): escape the app id, `mustClose` entries and resource paths written into `distribution.xml`, and attach `mustClose` to the app's bundle identifier so it applies when the app id contains characters the bundle id drops
