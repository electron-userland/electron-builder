---
"app-builder-lib": patch
---

Accept `minimatch` 10 or 11 (`^10.2.5 || ^11.0.1`). Fresh installs typically resolve 11.x, which is patched for GHSA-g3hv-75wg-m249; existing lockfiles can stay on 10.x or override to 11. File pattern matching behaves the same on both versions.
