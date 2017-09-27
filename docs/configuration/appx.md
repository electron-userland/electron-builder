The top-level [appx](configuration.md#Configuration-appx) key contains set of options instructing electron-builder on how it should build AppX (Windows Store).

Please also see [AppX Assets](/icons.md#appx).

All options are optional. All required for AppX configuration is inferred and computed automatically.

<!-- do not edit. start of generated block -->
* <code id="AppXOptions-applicationId">applicationId</code> String - The application id. Defaults to `identityName`. Can’t start with numbers.
* <code id="AppXOptions-backgroundColor">backgroundColor</code> = `#464646` String - The background color of the app tile. See [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx).
* <code id="AppXOptions-displayName">displayName</code> String - A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx). Defaults to the application product name.
* <code id="AppXOptions-identityName">identityName</code> String - The name. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx). Defaults to the [application name](/configuration/configuration#Metadata-name).
* <code id="AppXOptions-publisher">publisher</code> String - Describes the publisher information in a form `CN=your name exactly as in your cert`. The Publisher attribute must match the publisher subject information of the certificate used to sign a package. By default will be extracted from code sign certificate. Specify publisher only if electron-builder cannot compute correct one.
* <code id="AppXOptions-publisherDisplayName">publisherDisplayName</code> String - A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx). Defaults to company name from the application metadata.
* <code id="AppXOptions-languages">languages</code> Array&lt;String&gt; | String - The list of [supported languages](https://docs.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest) that will be listed in the Windows Store. The first entry (index 0) will be the default language. Defaults to en-US if omitted.

Inherited from `TargetSpecificOptions`:
* <code id="AppXOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template).
* <code id="AppXOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
<!-- end of generated block -->

## How to publish your Electron App to the Windows App Store

1. You'll need a microsoft developer account (pay some small fee). Use your favourite search engine to find the registration form.
2. Register you app for the desktop bridge [here](https://developer.microsoft.com/en-us/windows/projects/campaigns/desktop-bridge).
3. Wait for MS to answer and further guide you.
4. In the meantime, build and test your appx. It's dead simple. 

  ```json 
   "win": {
     "target": "appx",
   },
   ```
5. The rest should be pretty straight forward — upload the appx to the store and wait for approval.

## How to build AppX on macOS

The only solution for now — using [Parallels Desktop for Mac](http://www.parallels.com/products/desktop/) ([Pro Edition](https://forum.parallels.com/threads/prlctl-is-now-a-pro-or-business-version-tool-only.330290/) is required). Create Windows 10 virtual machine and start it. It will be detected and used automatically to build AppX on your macOS machine. Nothing is required to setup on Windows. It allows you to not copy project to Windows and to not setup build environment on Windows.