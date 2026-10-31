---
"app-builder-lib": patch
---

fix(nsis): fail the build with a clear error when a file path written into the generated NSIS script contains a double quote, backtick, line break or NUL character, instead of producing a broken script
