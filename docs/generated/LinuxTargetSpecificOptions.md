* <code id="LinuxTargetSpecificOptions-depends">depends</code> Array&lt;String&gt; - Package dependencies.
* <code id="LinuxTargetSpecificOptions-icon">icon</code> String
* <code id="LinuxTargetSpecificOptions-packageCategory">packageCategory</code> String - The package category.
* <code id="LinuxTargetSpecificOptions-vendor">vendor</code> String
* <code id="LinuxTargetSpecificOptions-maintainer">maintainer</code> String
* <code id="LinuxTargetSpecificOptions-afterInstall">afterInstall</code> String
* <code id="LinuxTargetSpecificOptions-afterRemove">afterRemove</code> String

Inherited from `CommonLinuxOptions`:
* <code id="LinuxTargetSpecificOptions-synopsis">synopsis</code> String - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="LinuxTargetSpecificOptions-description">description</code> String - As [description](/configuration/configuration.md#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="LinuxTargetSpecificOptions-category">category</code> String - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="LinuxTargetSpecificOptions-desktop">desktop</code> any - The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).

Inherited from `TargetSpecificOptions`:
* <code id="LinuxTargetSpecificOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template).
* <code id="LinuxTargetSpecificOptions-publish">publish</code> The [publish](/configuration/publish.md) options.