---
"app-builder-lib": patch
---

fix(win): accept only `asInvoker`, `highestAvailable` and `requireAdministrator` for `win.requestedExecutionLevel` when patching the executable manifest, and throw `InvalidConfigurationError` for any other value (programmatic configs bypass the schema enum)
