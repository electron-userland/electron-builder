---
"app-builder-lib": major
---

feat(mac)!: notarization uses exactly one credential set: more than one set of notarization environment variables (App Store Connect API key, Apple ID, keychain profile), even in part, or an incomplete set now fails with an `InvalidConfigurationError` at build start that names the variables (never their values), where v26 silently preferred the Apple ID. See https://www.electron.build/docs/migration/v27-build-changes#notarization-uses-exactly-one-credential-set
