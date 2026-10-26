---
"app-builder-lib": patch
---

fix(nsis): skip the assisted installer's license page on the first visit in the elevated inner instance only if it was accepted in the outer instance. Keep the license visible when elevation occurs before any pages are shown, and preserve Back navigation.
