---
"builder-util": patch
---

fix(security): strip credential env vars from child-process environment on Windows

Previously, child processes spawned during a Windows build (signtool, makeappx, package managers) inherited the full environment, including credential variables such as `CSC_KEY_PASSWORD`, `WIN_CSC_KEY_PASSWORD`, and publish tokens. `getProcessEnv` now applies the same credential deny-list on Windows that the other platforms already use, so these secrets are no longer passed down to spawned tools. Signing tools receive the certificate password as an explicit CLI argument (not via the environment), and required Windows system variables (`PATH`, `SYSTEMROOT`, `TEMP`, etc.) are preserved unchanged.
