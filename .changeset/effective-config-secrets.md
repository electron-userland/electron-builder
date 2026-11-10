---
"app-builder-lib": patch
---

fix: mask every `cscLink` and `cscInstallerLink` (mac, mas, masDev, win, snapcraft) and the credentials of URLs in `builder-effective-config.yaml` and the effective-config debug log; only the root `cscLink` was masked
