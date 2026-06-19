---
"app-builder-lib": major
---

fix(nsis): Generate Windows file-association ProgIDs in a unique, Microsoft-compliant format derived from the product filename and app GUID (BREAKING: custom NSIS scripts hard-coding the previous `name`/`ext` ProgID must be updated)
