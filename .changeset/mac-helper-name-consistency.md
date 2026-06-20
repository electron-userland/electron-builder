---
"app-builder-lib": major
---

fix(mac): keep `CFBundleName` and helper app bundle names consistent so Electron resolves helper apps on modern macOS

- macOS product and executable names are no longer normalized to NFD. The `.app` bundle, the helper bundles, and `CFBundleName` now all use the product name exactly as configured, which is required for Electron's helper-app lookup (`${CFBundleName} Helper.app`).
- macOS builds now require `productName` and `executableName` to be usable as a bundle name without any filename sanitization. A name that would otherwise be silently altered (for example one containing `/`, `\`, `:`, `*`, control characters, or trailing dots/spaces) now fails with a clear configuration error so you can choose a valid name.
