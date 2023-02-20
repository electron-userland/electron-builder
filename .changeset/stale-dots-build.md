---
"app-builder-lib": patch
"builder-util": patch
---

fix: report the correct status result when `doSign` exits early from macPackager and winPackager. Updated function definition to return `Promise<boolean>` to properly flag intellisense
