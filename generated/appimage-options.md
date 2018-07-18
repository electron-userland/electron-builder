* <code id="AppImageOptions-systemIntegration">systemIntegration</code> = `ask` "ask" | "doNotAsk" - The system integration installation.
* <code id="AppImageOptions-license">license</code> String - The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). Only plain text is supported.

Inherited from `CommonLinuxOptions`:

* <code id="AppImageOptions-synopsis">synopsis</code> String - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="AppImageOptions-description">description</code> String - As [description](/configuration/configuration.md#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="AppImageOptions-category">category</code> String - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="AppImageOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
* <code id="AppImageOptions-desktop">desktop</code> any - The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).

Inherited from `TargetSpecificOptions`:

* <code id="AppImageOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template).
* <code id="AppImageOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
