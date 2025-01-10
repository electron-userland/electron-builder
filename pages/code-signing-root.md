macOS and Windows code signing is supported. If the configuration values are provided correctly in your package.json, then signing should be automatically executed.

| Env Name       |  Description
| -------------- | -----------
| `CSC_LINK`                   | The HTTPS link (or base64-encoded data, or `file://` link, or local path) to certificate (`*.p12` or `*.pfx` file). Shorthand `~/` is supported (home directory).
| `CSC_KEY_PASSWORD`           | The password to decrypt the certificate given in `CSC_LINK`.
| `CSC_NAME`                   | *macOS-only* Name of certificate (to retrieve from login.keychain). Useful on a development machine (not on CI) if you have several identities (otherwise don't specify it).
| `CSC_IDENTITY_AUTO_DISCOVERY`| `true` or `false`. Defaults to `true` — on a macOS development machine valid and appropriate identity from your keychain will be automatically used.
| `CSC_KEYCHAIN`| The keychain name. Used if `CSC_LINK` is not specified. Defaults to system default keychain.

!!! tip
    If you are wrapping app to installer (pkg), you need to have `INSTALLER ID` identity in your keychain or provide according `CSC_INSTALLER_LINK` and `CSC_INSTALLER_KEY_PASSWORD`.

!!! tip
    If you are building Windows on macOS and need to set a different certificate and password (than the ones set in `CSC_*` env vars) you can use `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

## Travis, AppVeyor and other CI Servers
To sign app on build server you need to set `CSC_LINK`, `CSC_KEY_PASSWORD`:

1. [Export](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/MaintainingCertificates/MaintainingCertificates.html#//apple_ref/doc/uid/TP40012582-CH31-SW7) certificate.
 Consider to not use special characters (for bash[1]) in the password because “*values are not escaped when your builds are executed*”.
2. Encode file to base64 (macOS: `base64 -i yourFile.p12 -o envValue.txt`, Linux: `base64 yourFile.p12 > envValue.txt`).

   Or upload `*.p12` file (e.g. on Google Drive, use [direct link generator](http://www.syncwithtech.org/p/direct-download-link-generator.html) to get correct download link).

3. Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables. See [Travis](https://docs.travis-ci.com/user/environment-variables/#Defining-Variables-in-Repository-Settings) or [AppVeyor](https://www.appveyor.com/docs/build-configuration#environment-variables) documentation.
   Recommended to set it in the CI Project Settings, not in the `.travis.yml`/`appveyor.yml`. If you use link to file (not base64 encoded data), make sure to escape special characters (for bash[1]) accordingly.

   In case of AppVeyor, don't forget to click on lock icon to “Toggle variable encryption”.

   Keep in mind that Windows is not able to handle enviroment variable values longer than 8192 characters, thus if the base64 representation of your certificate exceeds that limit, try re-exporting the certificate without including all the certificates in the certification path (they are not necessary, but the Certificate Manager export wizard ticks the option by default), otherwise the encoded value will be truncated.

[1] `printf "%q\n" "<url>"`

## Where to Buy Code Signing Certificate
See [Get a code signing certificate](https://msdn.microsoft.com/windows/hardware/drivers/dashboard/get-a-code-signing-certificate) for Windows (platform: "Microsoft Authenticode").
Please note — Gatekeeper only recognises [Apple digital certificates](http://stackoverflow.com/questions/11833481/non-apple-issued-code-signing-certificate-can-it-work-with-mac-os-10-8-gatekeep).

## Alternative methods of codesigning

Codesigning via Electron Builder's configuration (via package.json) is not the only way to sign an application. Some people find it easier to codesign using a GUI tool. A couple of examples include:
- [SSL manager](https://www.ssl.com/ssl-manager)
- [DigiCert utility for Windows](https://www.digicert.com/support/tools/certificate-utility-for-windows)
Of course any comprehensive discussion of such tools is beyond the scope of this documentation.
