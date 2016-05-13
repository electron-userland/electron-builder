OS X and Windows code signing is supported. Windows is dual code-signed (SHA1 & SHA256 hashing algorithms).

On a development machine set environment variable `CSC_NAME` (and `CSC_INSTALLER_NAME` if you build for Mac App Store) to your identity.

| Env name       |  Description
| -------------- | -----------
| `CSC_LINK`                   | The HTTPS link (or base64-encoded data) to certificate (`*.p12` file).
| `CSC_KEY_PASSWORD`           | The password to decrypt the certificate given in `CSC_LINK`.
| `CSC_INSTALLER_LINK`         | *osx-only* The HTTPS link (or base64-encoded data) to certificate to sign Mac App Store build (`*.p12` file).
| `CSC_INSTALLER_KEY_PASSWORD` | *osx-only* The password to decrypt the certificate given in `CSC_INSTALLER_LINK`.
| `CSC_NAME`                   | *osx-only* Name of certificate (to retrieve from login.keychain). Useful on a development machine (not on CI).
| `CSC_INSTALLER_NAME`         | *osx-only* Name of installer certificate (to retrieve from login.keychain). Useful on a development machine (not on CI).

```
export CSC_NAME="Developer ID Application: Your Name (code)"
```

## Travis, AppVeyor and other CI servers
To sign app on build server you need to set `CSC_LINK`, `CSC_KEY_PASSWORD` (and `CSC_INSTALLER_LINK`, `CSC_INSTALLER_KEY_PASSWORD` if you build for Mac App Store):

1. [Export](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/MaintainingCertificates/MaintainingCertificates.html#//apple_ref/doc/uid/TP40012582-CH31-SW7) certificate.
 [Strong password](http://security.stackexchange.com/a/54773) must be used. Consider to not use special characters (for bash) because “*values are not escaped when your builds are executed*”.
2. Upload `*.p12` file (e.g. on [Google Drive](http://www.syncwithtech.org/p/direct-download-link-generator.html)).
3. Set ([Travis](https://docs.travis-ci.com/user/environment-variables/#Encrypted-Variables) or [AppVeyor](https://ci.appveyor.com/tools/encrypt)) `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables:
```
travis encrypt "CSC_LINK='https://drive.google.com/uc?export=download&id=***'" --add
travis encrypt 'CSC_KEY_PASSWORD=beAwareAboutBashEscaping!!!' --add
```

# Where to buy certificate

[StartSSL](https://startssl.com/Support?v=34) is recommended.
It can be used to sign OS X app also, so, you don't need to buy Apple Certificate in addition.