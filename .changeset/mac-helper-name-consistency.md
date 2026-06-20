---
"app-builder-lib": major
"builder-util": major
---

fix(mac): keep `CFBundleName` and helper app bundle names consistent so Electron resolves helper apps on modern macOS

- macOS product and executable names are no longer normalized to NFD. The `.app` bundle, helper bundles, and `CFBundleName` now use the same form, which is required for Electron's helper-app lookup. The original product name is still used for `CFBundleDisplayName`.
- `CFBundleName` is now derived from the sanitized product name so it always matches the on-disk helper bundle directories.
- macOS builds now reject a `productName` or `executableName` containing path separators (`/`, `\`) or null bytes with a clear configuration error instead of silently altering the name.
