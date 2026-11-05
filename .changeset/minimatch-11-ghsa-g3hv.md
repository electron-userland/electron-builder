---
"app-builder-lib": patch
---

Allow `minimatch` 11 alongside 10 (`^10.2.5 || ^11.0.1`) so projects can override to the release patched for GHSA-g3hv-75wg-m249. File pattern matching behaves the same on both versions.
