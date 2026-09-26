---
"app-builder-lib": major
---

feat(mac)!: stop granting `com.apple.security.cs.allow-unsigned-executable-memory` and `com.apple.security.cs.disable-library-validation` by default; nested binaries now use `@electron/osx-sign`'s Chromium-derived per-file defaults, MAS builds fall back to its sandboxed defaults, ad-hoc builds get a dedicated entitlements file, and a post-sign check warns about foreign-signed binaries in `app.asar.unpacked`
