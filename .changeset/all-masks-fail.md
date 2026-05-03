---
"app-builder-lib": patch
---

fix: only calculate asar integrity in `computeData` IFF electronFuse `enableEmbeddedAsarIntegrityValidation` is not explicitly disabled.
