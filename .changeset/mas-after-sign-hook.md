---
"app-builder-lib": patch
---

fix: emit `afterSign` hook for `mas`/`mas-dev` builds again. The MAS flow packs with `sign: false` and codesigns separately, which skipped the only `emitAfterSign` call site — the hook now fires after codesigning and before the installer `.pkg` is created, and the standard "skipping afterSign" warning is logged when signing does not occur (#9997)
