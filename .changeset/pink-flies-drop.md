---
"app-builder-lib": patch
---

fix: refactor signing mechanism to prevent concurrency issues, including adding a 15sec retry with 10sec backoff
