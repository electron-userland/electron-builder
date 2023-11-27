The top-level [win](configuration.md#Configuration-win) key contains set of options instructing electron-builder on how it should build Windows targets. These options applicable for any Windows target.

<!-- do not edit. start of generated block -->
* <code id="WindowsConfiguration-target">target</code> = `nsis` String | [TargetConfiguration](/cli#targetconfiguration) - The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` ([portable](/configuration/nsis#portable) app without installation), `appx`, `msi`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. AppX package can be built only on Windows 10.
    
    To use Squirrel.Windows please install `electron-builder-squirrel-windows` dependency.

* <code id="WindowsConfiguration-icon">icon</code> = `build/icon.ico` String | "undefined" - The path to application icon.
* <code id="WindowsConfiguration-legalTrademarks">legalTrademarks</code> String | "undefined" - The trademarks and registered trademarks.

---

* <code id="WindowsConfiguration-signingHashAlgorithms">signingHashAlgorithms</code> = `['sha1', 'sha256']` Array&lt;"sha256" | "sha1"&gt; | "undefined" - Array of signing algorithms used. For AppX `sha256` is always used.
* <code id="WindowsConfiguration-sign">sign</code> String | (configuration: CustomWindowsSignTaskConfiguration) => Promise - The custom function (or path to file or module id) to sign Windows executable.
* <code id="WindowsConfiguration-certificateFile">certificateFile</code> String | "undefined" - The path to the *.pfx certificate you want to sign with. Please use it only if you cannot use env variable `CSC_LINK` (`WIN_CSC_LINK`) for some reason. Please see [Code Signing](/code-signing).
* <code id="WindowsConfiguration-certificatePassword">certificatePassword</code> String | "undefined" - The password to the certificate provided in `certificateFile`. Please use it only if you cannot use env variable `CSC_KEY_PASSWORD` (`WIN_CSC_KEY_PASSWORD`) for some reason. Please see [Code Signing](/code-signing).
* <code id="WindowsConfiguration-certificateSubjectName">certificateSubjectName</code> String | "undefined" - The name of the subject of the signing certificate, which is often labeled with the field name `issued to`. Required only for EV Code Signing and works only on Windows (or on macOS if [Parallels Desktop](https://www.parallels.com/products/desktop/) Windows 10 virtual machines exits).
* <code id="WindowsConfiguration-certificateSha1">certificateSha1</code> String | "undefined" - The SHA1 hash of the signing certificate. The SHA1 hash is commonly specified when multiple certificates satisfy the criteria specified by the remaining switches. Works only on Windows (or on macOS if [Parallels Desktop](https://www.parallels.com/products/desktop/) Windows 10 virtual machines exits).
* <code id="WindowsConfiguration-additionalCertificateFile">additionalCertificateFile</code> String | "undefined" - The path to an additional certificate file you want to add to the signature block.
* <code id="WindowsConfiguration-rfc3161TimeStampServer">rfc3161TimeStampServer</code> = `http://timestamp.digicert.com` String | "undefined" - The URL of the RFC 3161 time stamp server.
* <code id="WindowsConfiguration-timeStampServer">timeStampServer</code> = `http://timestamp.digicert.com` String | "undefined" - The URL of the time stamp server.

---

* <code id="WindowsConfiguration-publisherName">publisherName</code> String | Array&lt;String&gt; | "undefined" - [The publisher name](https://github.com/electron-userland/electron-builder/issues/1187#issuecomment-278972073), exactly as in your code signed certificate. Several names can be provided. Defaults to common name from your code signing certificate.
* <code id="WindowsConfiguration-verifyUpdateCodeSignature">verifyUpdateCodeSignature</code> = `true` Boolean - Whether to verify the signature of an available update before installation. The [publisher name](#publisherName) will be used for the signature verification.
* <code id="WindowsConfiguration-requestedExecutionLevel">requestedExecutionLevel</code> = `asInvoker` "asInvoker" | "highestAvailable" | "requireAdministrator" | "undefined" - The [security level](https://msdn.microsoft.com/en-us/library/6ad1fshk.aspx#Anchor_9) at which the application requests to be executed. Cannot be specified per target, allowed only in the `win`.
* <code id="WindowsConfiguration-signAndEditExecutable">signAndEditExecutable</code> = `true` Boolean - Whether to sign and add metadata to executable. Advanced option.
* <code id="WindowsConfiguration-signDlls">signDlls</code> = `false` Boolean - Whether to sign DLL files. Advanced option. See: https://github.com/electron-userland/electron-builder/issues/3101#issuecomment-404212384 Deprecated: {tag.description}
* <code id="WindowsConfiguration-signExts">signExts</code> Array&lt;String&gt; | "undefined" - Explicit file extensions to also sign. Advanced option. See: https://github.com/electron-userland/electron-builder/issues/7329

<!-- end of generated block -->

---

{!includes/platform-specific-configuration-note.md!}

## Common Questions
#### How do delegate code signing?

Use [sign](#WindowsConfiguration-sign) option. Please also see [why sign.js is called 8 times](https://github.com/electron-userland/electron-builder/issues/3995).

```json
"win": {
  "sign": "./customSign.js"
}
```

File `customSign.js` in the project root directory:
```js
exports.default = async function(configuration) {
  // your custom code
}
```

#### How do use a custom verify function to enable nsis signature verification alternatives instead of powershell?

Use the `verifyUpdateCodeSignature` interface:

```js
/**
*  return null if verify signature succeed
*  return error message if verify signature failed
*/
export type verifyUpdateCodeSignature = (publisherName: string[], path: string) => Promise<string | null>
```

Pass a custom verify function to the nsis updater. For example, if you want to use a native verify function, you can use [win-verify-signature](https://github.com/beyondkmp/win-verify-trust).


```js
import { NsisUpdater } from "electron-updater"
import { verifySignatureByPublishName } from "win-verify-signature"
// Or MacUpdater, AppImageUpdater

export default class AppUpdater {
    constructor() {
        const options = {
            requestHeaders: {
                // Any request headers to include here
            },
            provider: 'generic',
            url: 'https://example.com/auto-updates'
        }

        const autoUpdater = new NsisUpdater(options)
        autoUpdater.verifyUpdateCodeSignature = (publisherName: string[], path: string) => {
            const result = verifySignatureByPublishName(path, publisherName);
            if(result.signed) return Promise.resolve(null);
            return Promise.resolve(result.message);
        }
        autoUpdater.addAuthHeader(`Bearer ${token}`)
        autoUpdater.checkForUpdatesAndNotify()
    }
}
```


#### How do create Parallels Windows 10 Virtual Machine?

!!! warning "Disable "Share Mac user folders with Windows""
    If you use Parallels, you [must not use](https://github.com/electron-userland/electron-builder/issues/865#issuecomment-258105498) "Share Mac user folders with Windows" feature and must not run installers from such folders.

You don't need to have Windows 10 license. Free is provided (expire after 90 days, but it is not a problem because no additional setup is required).

1. Open Parallels Desktop.
2. File -> New.
3. Select "Modern.IE" in the "Free Systems".
4. Continue, Continue, Accept software license agreement.
5. Select "Microsoft Edge on Windows 10".
6. The next steps are general, see [Installing Windows on your Mac using Parallels Desktop](http://kb.parallels.com/4729) from "Step 6: Specify a name and location".

Parallels Windows 10 VM will be used automatically to build AppX on macOS. No need even start VM — it will be started automatically on demand and suspended after build. No need to specify VM — it will be detected automatically (first Windows 10 VM will be used).

#### How do create VirtualBox Windows 10 Virtual Machine?

If you are not on macOS or don't want to buy [Parallels Desktop](https://www.parallels.com/products/desktop/), you can use free [VirtualBox](https://www.virtualbox.org/wiki/Downloads).

1. Open [Download virtual machines](https://developer.microsoft.com/en-us/microsoft-edge/tools/vms/).
2. Select "MSEdge on Win10 (x64) Stable".
3. Select "VirtualBox" platform.
4. Download. See [installation instructions](https://az792536.vo.msecnd.net/vms/release_notes_license_terms_8_1_15.pdf).

The password to your VM is `Passw0rd!`.

VirtualBox is not supported by electron-builder for now, so, you need to setup build environment on Windows if you want to use VirtualBox to build AppX (and other Windows-only tasks).
