---
"app-builder-lib": patch
---

fix(nsis): update the default `nsis` toolset to `2.0.2` (NSIS 3.12 compiled from source). Its `makensis` builds for Linux, macOS and Windows and its Windows stubs are log-enabled (`NSIS_CONFIG_LOG=yes`), so `installerDebugLogging` now works with the default toolset instead of needing a custom bundle. Pinning `toolsets.nsis` to `"1.2.1"` or `"0.0.0"` keeps the earlier bundles, which are not log-enabled
