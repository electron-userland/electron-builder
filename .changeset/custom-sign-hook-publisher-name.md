---
"app-builder-lib": major
"electron-updater": patch
---

feat!: a code-signed Windows build that writes `app-update.yml` (an `nsis`, `nsis-web` or `electronUpdaterAware` `appx` target with a publish configuration, including one inferred from a GitHub `repository`) now fails with an `InvalidConfigurationError` when its publisher name cannot be determined: a custom `win.sign.sign` hook without a certificate electron-builder can read, HSM with a hook and no certificate identifier, or an HSM/PKCS#11 certificate without a Common Name. Set `win.sign.publisherName` to the subject of the signing certificate (copy it from a binary your hook already signed), or set `win.verifyUpdateCodeSignature: false` only if your updates are not Authenticode-signed or you don't use electron-updater. Error and warning messages now name `win.sign.publisherName` instead of the removed `win.publisherName`.
