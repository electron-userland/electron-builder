---
"app-builder-lib": patch
---

fix(nsis): grant ALL APPLICATION PACKAGES read access on per-user install directories so the app's sandboxed processes can start when %LocalAppData% carries an AppContainer ACE
