---
"app-builder-lib": patch
---

fix: preserve symlinks in `zip` and `7z` archive targets on macOS and Linux via 7za `-snl` (Windows still dereferences). Restores pre-26.15 behavior after the bundled 7-Zip upgrade, which began dereferencing by default — corrupting macOS `.framework` bundles (codesign "bundle format is ambiguous", breaking Squirrel.Mac auto-update) and duplicating Linux symlink content.
