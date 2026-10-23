---
"app-builder-lib": patch
---

fix(nsis): add a 30-second inactivity timeout to PowerShell process checks. Cancel with exit code 2 when a probe times out or a path-filtered query or termination fails, rather than switching to name-based termination of potentially unrelated apps. Retain the existing fallback when PowerShell is unavailable, and preserve forced termination and the NSIS register stack.
