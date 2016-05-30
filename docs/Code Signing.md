OS X and Windows code signing is supported. Windows is dual code-signed (SHA1 & SHA256 hashing algorithms).

On a OS X development machine valid and appropriate identity from your keychain will be automatically used.

| Env name       |  Description
| -------------- | -----------
| `CSC_LINK`                   | The HTTPS link (or base64-encoded data) to certificate (`*.p12` file).
| `CSC_KEY_PASSWORD`           | The password to decrypt the certificate given in `CSC_LINK`.
| `CSC_INSTALLER_LINK`         | *osx-only* The HTTPS link (or base64-encoded data) to certificate to sign Mac App Store build (`*.p12` file).
| `CSC_INSTALLER_KEY_PASSWORD` | *osx-only* The password to decrypt the certificate given in `CSC_INSTALLER_LINK`.
| `CSC_NAME`                   | *osx-only* Name of certificate (to retrieve from login.keychain). Useful on a development machine (not on CI) if you have several identities (otherwise don't specify it).

## Travis, AppVeyor and other CI Servers
To sign app on build server you need to set `CSC_LINK`, `CSC_KEY_PASSWORD` (and `CSC_INSTALLER_LINK`, `CSC_INSTALLER_KEY_PASSWORD` if you build for Mac App Store):

1. [Export](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/MaintainingCertificates/MaintainingCertificates.html#//apple_ref/doc/uid/TP40012582-CH31-SW7) certificate.
 [Strong password](http://security.stackexchange.com/a/54773) must be used. Consider to not use special characters (for bash) because “*values are not escaped when your builds are executed*”.
2. Upload `*.p12` file (e.g. on Google Drive, use [direct link generator](http://www.syncwithtech.org/p/direct-download-link-generator.html) to get correct download link).

   Or encode file to base64 (osx/linux: `base64 -in yourFile.p12 -out envValue.txt`).
3. Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables (and `CSC_INSTALLER_LINK`/`CSC_INSTALLER_KEY_PASSWORD` in addition if you build MAS). See [Travis](https://docs.travis-ci.com/user/environment-variables/#Defining-Variables-in-Repository-Settings) or [AppVeyor](https://www.appveyor.com/docs/build-configuration#environment-variables) documentation.
   Recommended to set it in the CI Project Settings, not in the `.travis.yml`/`appveyor.yml` files to avoid special characters (for bash) issues.

   In case of AppVeyor, don't forget to click on lock icon to “Toggle variable encryption”.

# Where to Buy Code Signing Certificate
[StartSSL](https://startssl.com/Support?v=34) is recommended.
Please note — Gatekeeper only recognises [Apple digital certificates](http://stackoverflow.com/questions/11833481/non-apple-issued-code-signing-certificate-can-it-work-with-mac-os-10-8-gatekeep).