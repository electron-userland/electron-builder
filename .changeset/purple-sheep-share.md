---
"app-builder-lib": major
---

chore: remove deprecated fields from `winOptions` and `macOptions`

For `winOptions` signing configuration, it has been moved to `win.signtoolOptions` in order to support `azureOptions` as a separate field and avoid bloating `win` configuration object
For `macOptions`, notarize options has been deprecated in favor of env vars for quite some time. Env vars are much more secure
