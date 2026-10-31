---
"app-builder-lib": patch
---

Upgrade `minimatch` to `^11.0.1` to pick up the fix for GHSA-g3hv-75wg-m249. minimatch 11 still ships a CommonJS build, so file patterns keep matching as before.
