---
"app-builder-lib": patch
---

fix(win): only log "signing with signtool.exe" when a certificate is configured and signing actually runs; report at info level when signing is skipped because no certificate is configured (#10168)
