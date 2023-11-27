* <code id="AppImageOptions-license">license</code> String | "undefined" - The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). Only plain text is supported.

Inherited from `CommonLinuxOptions`:

* <code id="AppImageOptions-synopsis">synopsis</code> String | "undefined" - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="AppImageOptions-description">description</code> String | "undefined" - As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="AppImageOptions-category">category</code> String | "undefined" - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="AppImageOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | "undefined" - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
* <code id="AppImageOptions-desktop">desktop</code> any | "undefined" - The [Desktop file](https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html#desktop-files) entries (name to value).
* <code id="AppImageOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | "undefined" - The executable parameters. Pass to executableName

Inherited from `TargetSpecificOptions`:

* <code id="AppImageOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template).
* <code id="AppImageOptions-publish">publish</code> The [publish](/configuration/publish) options.
