* <code id="LinuxTargetSpecificOptions-depends">depends</code> Array&lt;String&gt; | "undefined" - Package dependencies.
* <code id="LinuxTargetSpecificOptions-compression">compression</code> = `xz` "gz" | "bzip2" | "xz" | "lzo" | "undefined" - The compression type.
* <code id="LinuxTargetSpecificOptions-icon">icon</code> String
* <code id="LinuxTargetSpecificOptions-packageCategory">packageCategory</code> String | "undefined" - The package category.
* <code id="LinuxTargetSpecificOptions-packageName">packageName</code> String | "undefined" - The name of the package.
* <code id="LinuxTargetSpecificOptions-vendor">vendor</code> String | "undefined"
* <code id="LinuxTargetSpecificOptions-maintainer">maintainer</code> String | "undefined"
* <code id="LinuxTargetSpecificOptions-afterInstall">afterInstall</code> String | "undefined"
* <code id="LinuxTargetSpecificOptions-afterRemove">afterRemove</code> String | "undefined"
* <code id="LinuxTargetSpecificOptions-fpm">fpm</code> Array&lt;String&gt; | "undefined" - *Advanced only* The [fpm](https://fpm.readthedocs.io/en/latest/cli-reference.html) options.
    
    Example: `["--before-install=build/deb-preinstall.sh", "--after-upgrade=build/deb-postinstall.sh"]`


Inherited from `CommonLinuxOptions`:

* <code id="LinuxTargetSpecificOptions-synopsis">synopsis</code> String | "undefined" - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
* <code id="LinuxTargetSpecificOptions-description">description</code> String | "undefined" - As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.
* <code id="LinuxTargetSpecificOptions-category">category</code> String | "undefined" - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
* <code id="LinuxTargetSpecificOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | "undefined" - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.
* <code id="LinuxTargetSpecificOptions-desktop">desktop</code> any | "undefined" - The [Desktop file](https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html#desktop-files) entries (name to value).
* <code id="LinuxTargetSpecificOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | "undefined" - The executable parameters. Pass to executableName

Inherited from `TargetSpecificOptions`:

* <code id="LinuxTargetSpecificOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template).
* <code id="LinuxTargetSpecificOptions-publish">publish</code> The [publish](/configuration/publish) options.
