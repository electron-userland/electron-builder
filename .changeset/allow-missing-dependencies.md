---
"app-builder-lib": minor
---

feat: add `allowMissingDependencies?: boolean | string[] | null` configuration (issue #10058). When node-module collection completes and a production dependency could not be resolved (`cannot find path for dependency` / `dependency not found on disk`), the option controls whether the build fails: `true` or omitted (the v26 default) keeps today's warn-only behavior, `false`/`null` fails the build with an error listing the complete set of missing dependencies, and a `string[]` allows only the listed dependency names to be missing (bare package name, or exact `name@version`) while any other missing production dependency fails. Missing optional dependencies (e.g. `fsevents` on Linux/Windows) are always allowed. Note: electron-builder 27+ flips the default to `false` (fail-closed); the stable 26.x line keeps warn-only by default to avoid breaking existing builds.
