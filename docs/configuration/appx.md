The top-level [appx](configuration.md#Configuration-appx) key contains set of options instructing electron-builder on how it should build AppX (Windows Store).

Please also see [AppX Assets](/icons.md#appx).

<!-- do not edit. start of generated block -->
* <code id="AppXOptions-backgroundColor">backgroundColor</code> String - The background color of the app tile. See: [Visual Elements](https://msdn.microsoft.com/en-us/library/windows/apps/br211471.aspx).
* <code id="AppXOptions-publisher">publisher</code> String - Describes the publisher information in a form `CN=your name exactly as in your cert`. The Publisher attribute must match the publisher subject information of the certificate used to sign a package. By default will be extracted from code sign certificate.
* <code id="AppXOptions-displayName">displayName</code> String - A friendly name that can be displayed to users. Corresponds to [Properties.DisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211432.aspx).
* <code id="AppXOptions-publisherDisplayName">publisherDisplayName</code> String - A friendly name for the publisher that can be displayed to users. Corresponds to [Properties.PublisherDisplayName](https://msdn.microsoft.com/en-us/library/windows/apps/br211460.aspx).
* <code id="AppXOptions-identityName">identityName</code> = `${name}` String - The name. Corresponds to [Identity.Name](https://msdn.microsoft.com/en-us/library/windows/apps/br211441.aspx).
* <code id="AppXOptions-languages">languages</code> Array&lt;String&gt; | String - The list of [supported languages](https://docs.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest) that will be listed in the Windows Store. The first entry (index 0) will be the default language. Defaults to en-US if omitted.

Inherited from `TargetSpecificOptions`:
* <code id="AppXOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template).
* <code id="AppXOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
<!-- end of generated block -->