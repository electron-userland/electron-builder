---
"app-builder-lib": patch
---

fix(appx): derive the AppX/MSIX `Publisher` from the signing certificate subject in the format Windows reports it (`, `-separated, `S` for the state), so MakeAppx accepts a certificate whose subject has more than a CN
