---
"app-builder-lib": patch
---

fix(mac): skip redundant signing in signApp() for MAS builds

Fixed MAS builds using wrong provisioning profile by skipping the redundant first signing in `signApp()`. Previously, MAS builds were signed twice - first incorrectly with darwin options, then correctly with MAS options. This caused build failures when the darwin provisioning profile didn't exist.
