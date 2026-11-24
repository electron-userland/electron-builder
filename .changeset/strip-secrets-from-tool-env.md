---
"app-builder-lib": patch
---

fix: do not pass publish credentials (`GH_TOKEN`, `GITHUB_TOKEN`, `GITLAB_TOKEN`, `KEYGEN_TOKEN`, …) or `ELECTRON_BUILDER_UPDATE_SIGN_KEY` to signtool, osslsigncode and makensis; signing variables are still passed
