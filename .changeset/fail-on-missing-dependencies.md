---
"app-builder-lib": minor
---

feat: add opt-in `failOnMissingDependencies` configuration (`boolean | string[]`) to fail the build after node-module collection when production dependencies cannot be resolved (`cannot find path for dependency` / `dependency not found on disk`), reporting the complete list of missing dependencies at once. A `string[]` value enables enforcement while exempting the listed dependency names. Missing optional dependencies never fail the build. Default remains warn-only.
