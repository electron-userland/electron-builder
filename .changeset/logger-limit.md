---
"builder-util": minor
"builder-util-runtime": minor
"app-builder-lib": patch
"electron-builder": patch
"electron-updater": patch
---

feat(builder-util): `log.limit({ key, max, scope })` / `log.once(key, scope)` emit a keyed message at most N times (per process, or per scope object), replacing hand-rolled "already warned" flags; electron-updater counts once-per-updater warnings internally without changing the injectable `Logger` interface. Both share one limiter (`wrap()` on any `{ info, warn, error, debug? }` logger, including `console`), and its `LogLevel`, `LogLimitOptions`, `LoggerLike` and `LimitedLogger` types are now exported from builder-util-runtime (builder-util re-exports them)
