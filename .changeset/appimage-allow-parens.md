---
"app-builder-lib": patch
---

fix: allow parentheses in AppImage executable, product, and license file names. Before, product names like `Zoo Design Studio (Staging)` failed AppImage builds with "productFilename contains characters that cannot be safely used in file paths" — a regression from the Go pipeline, which accepted them. After, names containing `(` and `)` build again; parentheses are legal in Linux filenames and inert inside the double-quoted bash strings of the generated AppRun launcher, while genuinely dangerous characters (`$`, backticks, quotes, slashes) remain rejected.
