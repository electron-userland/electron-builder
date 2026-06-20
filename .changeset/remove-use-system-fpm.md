---
"app-builder-lib": major
---

feat(toolsets)!: remove `USE_SYSTEM_FPM` env override; require an explicit custom toolset on Windows

- Remove the `USE_SYSTEM_FPM` environment flag — the last of the `USE_SYSTEM_*` toolset overrides. To use a non-bundled fpm, configure `toolsets.fpm` with a custom toolset pointing at the directory containing the `fpm` executable, e.g. `{ url: "file:///opt/homebrew/bin" }`.
- A custom toolset is now honored before the platform fallback in `getFpmPath()` and `getOsslSigncodeBundle()`, so an explicit override is respected on every platform (previously it was silently ignored on Windows).
- On Windows with no custom toolset configured, `getFpmPath()` now throws `InvalidConfigurationError` instead of resolving a bare `fpm` from `$PATH`, closing a binary-hijack vector (`getOsslSigncodeBundle()` throws as defense-in-depth on the same path).
