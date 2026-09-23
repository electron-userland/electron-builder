---
"app-builder-lib": minor
---

feat: validate `to` destinations in `extraFiles`/`extraResources` file sets. An absolute `to` path (POSIX, Windows drive-letter, or UNC) or a relative `to` that escapes the build output directory now fails the build with a clear `InvalidConfigurationError` instead of silently copying files outside the package onto the build machine. Relative hops that stay inside the build output directory (e.g. `to: "../Frameworks"` from `Contents/Resources` on macOS) keep working. The error suggests the fpm file-mapping syntax (`"deb": { "fpm": ["src=/abs/dest"] }`) for users who want absolute in-package paths on deb/rpm.
