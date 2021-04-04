macOS and Windows code signing is supported. Windows is dual code-signed (SHA1 & SHA256 hashing algorithms).

On a macOS development machine, a valid and appropriate identity from your keychain will be automatically used.

!!! tip 
    See article [Notarizing your Electron application](https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/).
  

| Env Name       |  Description
| -------------- | -----------
| `CSC_LINK`                   | The HTTPS link (or base64-encoded data, or `file://` link, or local path) to certificate (`*.p12` or `*.pfx` file). Shorthand `~/` is supported (home directory).
| `CSC_KEY_PASSWORD`           | The password to decrypt the certificate given in `CSC_LINK`.
| `CSC_NAME`                   | *macOS-only* Name of certificate (to retrieve from login.keychain). Useful on a development machine (not on CI) if you have several identities (otherwise don't specify it).
| `CSC_IDENTITY_AUTO_DISCOVERY`| `true` or `false`. Defaults to `true` — on a macOS development machine valid and appropriate identity from your keychain will be automatically used.
| `CSC_KEYCHAIN`| The keychain name. Used if `CSC_LINK` is not specified. Defaults to system default keychain.

!!! tip
    If you are building Windows on macOS and need to set a different certificate and password (than the ones set in `CSC_*` env vars) you can use `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

## Windows

To sign an app on Windows, there are two types of certificates:

* EV Code Signing Certificate
* Code Signing Certificate

Both certificates work with auto-update. The regular (and often cheaper) Code Signing Certificate shows a warning during installation that goes away once enough users installed your application and you've built up trust. The EV Certificate has more trust and thus works immediately without any warnings. However, it is not possible to export the EV Certificate as it is bound to a physical USB dongle. Thus, you can't export the certificate for signing code on a CI, such as AppVeyor. 

If you are using an EV Certificate, you need to provide [win.certificateSubjectName](configuration/win.md#WindowsConfiguration-certificateSubjectName) in your electron-builder configuration.

If you use Windows 7, please ensure that [PowerShell](https://blogs.technet.microsoft.com/heyscriptingguy/2013/06/02/weekend-scripter-install-powershell-3-0-on-windows-7/) is updated to version 3.0.

If you are on Linux or Mac and you want sign a Windows app using EV Code Signing Certificate, please use [the guide for Unix systems](tutorials/code-signing-windows-apps-on-unix.md).

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

## How to Export Certificate on macOS

1. Open Keychain.
2. Select `login` keychain, and `My Certificates` category.
3. Select all required certificates (hint: use cmd-click to select several):
   * `Developer ID Application:` to sign app for macOS.
   * `3rd Party Mac Developer Installer:` and either `Apple Distribution` or `3rd Party Mac Developer Application:` to sign app for MAS (Mac App Store).
   * `Developer ID Application:` and `Developer ID Installer` to sign app and installer for distribution outside of the Mac App Store.
   * `Apple Development:` or `Mac Developer:` to sign development builds for testing Mac App Store submissions (`mas-dev` target). You also need a provisioning profile in the working directory that matches this certificate and the device being used for testing.

   Please note – you can select as many certificates as needed. No restrictions on electron-builder side.
   All selected certificates will be imported into temporary keychain on CI server.
4. Open context menu and `Export`.

## How to Disable Code Signing During the Build Process on macOS

To disable Code Signing when building for macOS leave all the above vars unset except for `CSC_IDENTITY_AUTO_DISCOVERY` which needs to be set to `false`. This can be done by running `export CSC_IDENTITY_AUTO_DISCOVERY=false`. 

Another way — set `mac.identity` to `null`. You can pass aditional configuration using CLI as well: `-c.mac.identity=null`.
