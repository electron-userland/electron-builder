---
"app-builder-lib": patch
---

fix: don't warn about missing com.apple.security.cs.disable-library-validation entitlement when the effective entitlements file already grants it (ad-hoc + hardened runtime builds)
