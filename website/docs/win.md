---
title: "Windows"
---

{!./partials/_upgrading-from-v26.md!}

The top-level [win](./configuration.md#win) key contains a set of options instructing electron-builder on how it should build Windows targets. These options are applicable to any Windows target.

---

## Common Questions
## How do you delegate code signing?

In v27, all Windows signing is configured through the single [`win.sign`](./configuration.md#win) discriminated union (`type: "signtool" | "hsm" | "pkcs11" | "azure"`). To delegate signing to a custom function, set the `sign` field on that union — it works for the `signtool`, `hsm` and `pkcs11` types. See the [Windows Code Signing guide](./features/code-signing/code-signing-win.md) and [why sign.js is called 8 times](https://github.com/electron-userland/electron-builder/issues/3995).

```json
"win": {
  "sign": {
    "type": "signtool",
    "sign": "./customSign.js",
    "publisherName": "CN=My Company, O=My Company, C=US"
  }
}
```

electron-builder cannot read the certificate your hook signs with, so set `publisherName` to that certificate's subject: it is written to `app-update.yml`, and electron-updater checks every downloaded update against it. It is never derived from a certificate for a hook, not even one in the config, so without it a build that writes `app-update.yml` (an `nsis`, `nsis-web` or `electronUpdaterAware` `appx` target with a publish configuration, including one inferred from a GitHub `repository`) fails. Set `win.verifyUpdateCodeSignature: false` instead only if your updates are not Authenticode-signed or you don't use electron-updater.

Copy the subject from a binary your hook has already signed (a previous release, or `win-unpacked` from an `electron-builder --win dir` build, which does not write `app-update.yml`) instead of typing it by hand. electron-builder cannot check it against the certificate the hook uses, and every component you list (`CN`, `O`, `C`, …) must match the certificate exactly — otherwise installed apps reject every later update:

- **Windows (PowerShell):** `(Get-AuthenticodeSignature .\dist\win-unpacked\<App>.exe).SignerCertificate.Subject` prints it in the form to use as-is.
- **macOS / Linux:** `osslsigncode verify -in <App>.exe` — the `Subject:` line under "Signer's certificate", printed as `/C=US/ST=California/O=My Company, Inc./CN=My Company, Inc.`. Keep only `CN`, `O` and `C` and write them as `CN="My Company, Inc.", O="My Company, Inc.", C=US`: OpenSSL names some other components differently from Windows (`ST` instead of `S`, for example), and a value that contains a comma must be wrapped in double quotes.

:::note[Upgrading from v26]
The v26 `win.signtoolOptions` / `win.azureSignOptions` keys were removed — `electron-builder migrate-schema` rewrites them to `win.sign` automatically. See [v27 Breaking Changes → Windows signing](./migration/v27-breaking-changes.md#windows-signing-winsign).
:::

File `customSign.js` in the project root directory:
```js
exports.default = async function(configuration) {
  // your custom code
}
```

## How do you use a custom verify function to enable nsis signature verification alternatives instead of powershell?

Use the `NsisUpdater.verifyUpdateFileAuthenticodeSignature` interface:

```ts
export type VerifyUpdateFileResult =
  | { response: "success" }
  | { response: "failure"; message: string }

export type VerifyUpdateFileAuthenticodeSignature = (
  publisherName: string[],
  path: string
) => Promise<VerifyUpdateFileResult>
```

Pass a custom verify function to the nsis updater. For example, if you want to use a native verify function, you can use [win-verify-signature](https://github.com/beyondkmp/win-verify-trust).

```ts
import { NsisUpdater } from "electron-updater"
import { verifySignatureByPublishName } from "win-verify-signature"

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
        autoUpdater.verifyUpdateFileAuthenticodeSignature = async (publisherName: string[], path: string) => {
            const result = verifySignatureByPublishName(path, publisherName)
            return result.signed ? { response: "success" } : { response: "failure", message: result.message }
        }
        autoUpdater.addAuthHeader(`Bearer ${token}`)
        autoUpdater.checkForUpdatesAndNotify()
    }
}
```

The built-in default uses [`windowsExecutableCodeSignatureVerifier`](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts).
The older property `verifyUpdateCodeSignature`, which differs only in name and return interface, is deprecated and kept only as a compatibility shim (shall be removed in electron-builder v28). The protected `_verifyUpdateCodeSignature` member is likewise deprecated in favour of `_verifyUpdateFileAuthenticodeSignature`.

## How do you create a Parallels Windows 10 Virtual Machine?

:::warning[Disable "Share Mac user folders with Windows"]
If you use Parallels, you [must not use](https://github.com/electron-userland/electron-builder/issues/865#issuecomment-258105498) "Share Mac user folders with Windows" feature and must not run installers from such folders.
:::

You don't need to have a Windows 10 license. A free license is provided (expires after 90 days, but this is not a problem because no additional setup is required).

1. Open Parallels Desktop.
2. File -> New.
3. Select "Modern.IE" in the "Free Systems".
4. Continue, Continue, Accept software license agreement.
5. Select "Microsoft Edge on Windows 10".
6. The next steps are general, see [Installing Windows on your Mac using Parallels Desktop](http://kb.parallels.com/4729) from "Step 6: Specify a name and location".

Parallels Windows 10 VM will be used automatically to build AppX on macOS. No need even start VM — it will be started automatically on demand and suspended after build. No need to specify VM — it will be detected automatically (first Windows 10 VM will be used).

## How do you create a VirtualBox Windows 10 Virtual Machine?

If you are not on macOS or don't want to buy [Parallels Desktop](https://www.parallels.com/products/desktop/), you can use free [VirtualBox](https://www.virtualbox.org/wiki/Downloads).

1. Open [Download virtual machines](https://developer.microsoft.com/en-us/microsoft-edge/tools/vms/).
2. Select "MSEdge on Win10 (x64) Stable".
3. Select "VirtualBox" platform.
4. Download. See [installation instructions](https://az792536.vo.msecnd.net/vms/release_notes_license_terms_8_1_15.pdf).

The password to your VM is `Passw0rd!`.

VirtualBox is not supported by electron-builder for now, so you need to set up the build environment on Windows if you want to use VirtualBox to build AppX (and other Windows-only tasks).

## Configuration

  {!./app-builder-lib.Interface.WindowsConfiguration.md!}
