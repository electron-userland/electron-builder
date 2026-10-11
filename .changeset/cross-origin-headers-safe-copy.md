---
"builder-util-runtime": patch
---

fix: `HttpExecutor.removeCrossOriginSensitiveHeaders` copies the headers with `deepAssign`, which ignores `__proto__`, `constructor` and `prototype` keys
