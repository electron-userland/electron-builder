macOS and Windows code signing is supported. Windows is dual code-signed (SHA1 & SHA256 hashing algorithms).

On a macOS development machine valid and appropriate identity from your keychain will be automatically used.

| Env Name       |  Description
| -------------- | -----------
| `CSC_LINK`                   | The HTTPS link (or base64-encoded data, or `file://` link, or local path) to certificate (`*.p12` or `*.pfx` file). Shorthand `~/` is supported (home directory).
| `CSC_KEY_PASSWORD`           | The password to decrypt the certificate given in `CSC_LINK`.
| `CSC_NAME`                   | *macOS-only* Name of certificate (to retrieve from login.keychain). Useful on a development machine (not on CI) if you have several identities (otherwise don't specify it).
| `CSC_IDENTITY_AUTO_DISCOVERY`| `true` or `false`. Defaults to `true` — on a macOS development machine valid and appropriate identity from your keychain will be automatically used.

If you are building Windows on macOS and need to set a different certificate and password (than the ones set in `CSC_*` env vars) you can use `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

## Travis, AppVeyor and other CI Servers
To sign app on build server you need to set `CSC_LINK`, `CSC_KEY_PASSWORD`:

1. [Export](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/MaintainingCertificates/MaintainingCertificates.html#//apple_ref/doc/uid/TP40012582-CH31-SW7) certificate.
 Consider to not use special characters (for bash) in the password because “*values are not escaped when your builds are executed*”.
2. Encode file to base64 (macOS/linux: `base64 -i yourFile.p12 -o envValue.txt`).

   Or upload `*.p12` file (e.g. on Google Drive, use [direct link generator](http://www.syncwithtech.org/p/direct-download-link-generator.html) to get correct download link).

3. Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables. See [Travis](https://docs.travis-ci.com/user/environment-variables/#Defining-Variables-in-Repository-Settings) or [AppVeyor](https://www.appveyor.com/docs/build-configuration#environment-variables) documentation.
   Recommended to set it in the CI Project Settings, not in the `.travis.yml`/`appveyor.yml`. If you use link to file (not base64 encoded data), make sure to escape special characters (for bash) accordingly.

   In case of AppVeyor, don't forget to click on lock icon to “Toggle variable encryption”.

# Where to Buy Code Signing Certificate
[StartSSL](https://startssl.com/Support?v=34) is recommended.
Please note — Gatekeeper only recognises [Apple digital certificates](http://stackoverflow.com/questions/11833481/non-apple-issued-code-signing-certificate-can-it-work-with-mac-os-10-8-gatekeep).

# How to Export Certificate on macOS

1. Open Keychain.
2. Select `login` keychain, and `My Certificates` category.
3. Select all required certificates (hint: use cmd-click to select several):
   * `Developer ID Application:` to sign app for macOS.
   * `3rd Party Mac Developer Application:` and `3rd Party Mac Developer Installer:` to sign app for MAS (Mac App Store).
   * `Developer ID Application:` and `Developer ID Installer` to sign app and installer for distribution outside of the Mac App Store.

   Please note – you can select as many certificates, as need. No restrictions on electron-builder side.
   All selected certificates will be imported into temporary keychain on CI server.
4. Open context menu and `Export`.