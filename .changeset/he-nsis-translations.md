---
"app-builder-lib": patch
---

feat(nsis): add Hebrew (he) translations for one-click and assisted installer messages

Also add `he_IL` to `bundledLanguages` so Hebrew strings actually reach the built installer (fixes a pre-existing bug where Hebrew was never included in the default multi-language set).
