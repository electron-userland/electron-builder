---
"app-builder-lib": minor
---

feat(mac): `APPLE_API_KEY` also accepts the App Store Connect API key's `.p8` contents base64-encoded on one line, so masked CI variables can hold it (#10344) — electron-builder writes it to a new `0600` temporary file for each notarization and deletes it once notarytool is done; a path keeps working unchanged, and key text (PEM) or a damaged base64 value now fails before notarization with an `InvalidConfigurationError` that does not print the key. The notarization guide documented base64 content before it was supported.
