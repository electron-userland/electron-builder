The top-level [win](configuration.md#Configuration-win) key contains set of options instructing electron-builder on how it should build Windows targets. These options applicable for any Windows target.

<!-- do not edit. start of generated block -->
* <code id="WindowsConfiguration-target">target</code> = `nsis` String | [TargetConfiguration](target.md#targetconfig) - The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` (portable app without installation), `appx`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. AppX package can be built only on Windows 10.
  
  To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.
  
  For `portable` app, `PORTABLE_EXECUTABLE_DIR` env is set (dir where portable executable located).
* <code id="WindowsConfiguration-signingHashAlgorithms">signingHashAlgorithms</code> = `['sha1', 'sha256']` Array&lt;"sha1" | "sha256"&gt; - Array of signing algorithms used. For AppX `sha256` is always used.
* <code id="WindowsConfiguration-icon">icon</code> = `build/icon.ico` String - The path to application icon.
* <code id="WindowsConfiguration-legalTrademarks">legalTrademarks</code> String - The trademarks and registered trademarks.
* <code id="WindowsConfiguration-certificateFile">certificateFile</code> String - The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable `CSC_LINK` (`WIN_CSC_LINK`) for some reason. Please see [Code Signing](../code-signing.md).
* <code id="WindowsConfiguration-certificatePassword">certificatePassword</code> String - The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason. Please see [Code Signing](../code-signing.md).
* <code id="WindowsConfiguration-certificateSubjectName">certificateSubjectName</code> String - The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
* <code id="WindowsConfiguration-certificateSha1">certificateSha1</code> String - The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows.
* <code id="WindowsConfiguration-additionalCertificateFile">additionalCertificateFile</code> String - The path to an additional certificate file you want to add to the signature block.
* <code id="WindowsConfiguration-rfc3161TimeStampServer">rfc3161TimeStampServer</code> = `http://timestamp.comodoca.com/rfc3161` String - The URL of the RFC 3161 time stamp server.
* <code id="WindowsConfiguration-timeStampServer">timeStampServer</code> = `http://timestamp.verisign.com/scripts/timstamp.dll` String - The URL of the time stamp server.
* <code id="WindowsConfiguration-publisherName">publisherName</code> String | Array&lt;String&gt; - [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided. Defaults to common name from your code signing certificate.
* <code id="WindowsConfiguration-verifyUpdateCodeSignature">verifyUpdateCodeSignature</code> = `true` Boolean - Whether to verify the signature of an available update before installation. The [publisher name](#publisherName) will be used for the signature verification.
* <code id="WindowsConfiguration-requestedExecutionLevel">requestedExecutionLevel</code> = `asInvoker` "asInvoker" | "highestAvailable" | "requireAdministrator" - The [security level](https://msdn.microsoft.com/en-us/library/6ad1fshk.aspx#Anchor_9) at which the application requests to be executed. Cannot be specified per target, allowed only in the `win`.
<!-- end of generated block -->