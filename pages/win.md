The top-level [win](configuration.md#win) key contains set of options instructing electron-builder on how it should build Windows targets. These options applicable for any Windows target.

---

## Common Questions
## How do delegate code signing?

Use [sign](app-builder-lib.Interface.WindowsSigntoolConfiguration.md#sign) option. Please also see [why sign.js is called 8 times](https://github.com/electron-userland/electron-builder/issues/3995).

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

## How do use a custom verify function to enable nsis signature verification alternatives instead of powershell?

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


## How do create Parallels Windows 10 Virtual Machine?

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

## How do create VirtualBox Windows 10 Virtual Machine?

If you are not on macOS or don't want to buy [Parallels Desktop](https://www.parallels.com/products/desktop/), you can use free [VirtualBox](https://www.virtualbox.org/wiki/Downloads).

1. Open [Download virtual machines](https://developer.microsoft.com/en-us/microsoft-edge/tools/vms/).
2. Select "MSEdge on Win10 (x64) Stable".
3. Select "VirtualBox" platform.
4. Download. See [installation instructions](https://az792536.vo.msecnd.net/vms/release_notes_license_terms_8_1_15.pdf).

The password to your VM is `Passw0rd!`.

VirtualBox is not supported by electron-builder for now, so, you need to setup build environment on Windows if you want to use VirtualBox to build AppX (and other Windows-only tasks).

## Configuration

{!./app-builder-lib.Interface.WindowsConfiguration.md!}
