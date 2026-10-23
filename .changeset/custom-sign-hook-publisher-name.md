---
"app-builder-lib": major
"electron-updater": patch
---

feat!: a code-signed Windows build that writes `app-update.yml` (an `nsis`, `nsis-web` or `electronUpdaterAware` `appx` target with a publish configuration, including one inferred from a GitHub `repository`) now fails with an `InvalidConfigurationError` when its publisher name cannot be determined: any custom `win.sign.sign` hook without `win.sign.publisherName` (its publisher name is never derived from a certificate, not even one in the config — `certificateFile`, `certificateSubjectName`, `certificateSha1`, `cscLink` — or from `WIN_CSC_LINK` / `CSC_LINK`, because the hook may sign with another one), or a certificate without a Common Name (including a certificate-store subject, which no longer yields an undefined publisher name). Set `win.sign.publisherName` to the subject of the signing certificate (copy it from a binary your hook already signed), or set `win.verifyUpdateCodeSignature: false` only if your updates are not Authenticode-signed or you don't use electron-updater. Error and warning messages now name `win.sign.publisherName` instead of the removed `win.publisherName`.
