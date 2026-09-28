---
"app-builder-lib": patch
---

fix: register pnpm dependencies that `pnpm list --prod` (10.29.3+) only ever prints as childless deduped stubs beneath other deduped stubs. Such packages (e.g. `wrappy` under `once`, `ms` under `debug`) never reached `allDependencies`, so the production graph dropped them and the packaged app failed at runtime with `MODULE_NOT_FOUND`. When a package.json-declared dependency is missing from the collected tree, the collector now resolves it on disk from the dependent's real store directory and registers it directly, instead of falling back to a name-only match or to nothing.
