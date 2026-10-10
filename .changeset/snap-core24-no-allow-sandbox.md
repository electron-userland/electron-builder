---
"app-builder-lib": patch
---

fix(snap): core24 no longer requests `browser-support` with `allow-sandbox` by default (the Snap Store rejects it for non-vetted publishers); default core24 snaps now launch with `--no-sandbox` and omit `chrome-sandbox`, and an explicitly configured `allow-sandbox` logs a store-review warning
