---
"app-builder-lib": major
---

feat(mac)!: `mac.notarize: true` requires notarization: a build without notarization credentials fails with an `InvalidConfigurationError`, at build start on a macOS host and when notarizing. Left unset, notarization runs when the credentials are set and is skipped with a warning otherwise. See https://www.electron.build/docs/migration/v27-build-changes#mac-notarize-true-requires-credentials
