---
"app-builder-lib": patch
---

fix(nsis): add a 30-second inactivity timeout to PowerShell process checks. Cancel with exit code 2 and a check-failed message when a probe is inconclusive, a process query fails, or path-filtered termination times out or cannot start, including in silent updates. Keep numeric termination results in the existing process recheck and force/retry loop. Retain the existing fallback when PowerShell is unavailable, and preserve forced termination and the NSIS register stack.
