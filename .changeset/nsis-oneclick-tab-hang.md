---
"app-builder-lib": patch
---

fix(nsis): pressing Tab while a one-click installer shows its progress banner no longer makes the installer stop responding; keyboard focus now moves from the hidden install page to the banner's status text, which screen readers also announce
