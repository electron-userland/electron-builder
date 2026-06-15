---
"app-builder-lib": patch
"builder-util": minor
---

fix: add retry-tolerant `ensureDir` to address recurring flaky `ENOENT … mkdir '<cache>/fpm@2.2.1/…'` during concurrent toolset downloads
