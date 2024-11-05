---
"app-builder-lib": patch
---

fix: only sign concurrently when using local signtool. azure can't be in parallel due to resources being locked during usage
