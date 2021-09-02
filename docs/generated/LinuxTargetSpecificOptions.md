<ul>
<li><code id="LinuxTargetSpecificOptions-depends">depends</code> Array&lt;String&gt; | "undefined" - Package dependencies.</li>
<li><code id="LinuxTargetSpecificOptions-compression">compression</code> = `xz` "gz" | "bzip2" | "xz" | "undefined" - The compression type.</li>
<li><code id="LinuxTargetSpecificOptions-icon">icon</code> String</li>
<li><code id="LinuxTargetSpecificOptions-packageCategory">packageCategory</code> String | "undefined" - The package category.</li>
<li><code id="LinuxTargetSpecificOptions-packageName">packageName</code> String | "undefined" - The name of the package.</li>
<li><code id="LinuxTargetSpecificOptions-vendor">vendor</code> String | "undefined"</li>
<li><code id="LinuxTargetSpecificOptions-maintainer">maintainer</code> String | "undefined"</li>
<li><code id="LinuxTargetSpecificOptions-afterInstall">afterInstall</code> String | "undefined"</li>
<li><code id="LinuxTargetSpecificOptions-afterRemove">afterRemove</code> String | "undefined"</li>
<li><code id="LinuxTargetSpecificOptions-fpm">fpm</code> Array&lt;String&gt; | "undefined" - *Advanced only* The [fpm](https://github.com/jordansissel/fpm/wiki#usage) options.
    
    Example: `["--before-install=build/deb-preinstall.sh", "--after-upgrade=build/deb-postinstall.sh"]`
</li>
</ul>

Inherited from `CommonLinuxOptions`:

<ul>
<li><code id="LinuxTargetSpecificOptions-synopsis">synopsis</code> String | "undefined" - The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).</li>
<li><code id="LinuxTargetSpecificOptions-description">description</code> String | "undefined" - As [description](/configuration/configuration#Metadata-description) from application package.json, but allows you to specify different for Linux.</li>
<li><code id="LinuxTargetSpecificOptions-category">category</code> String | "undefined" - The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).</li>
<li><code id="LinuxTargetSpecificOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | "undefined" - The mime types in addition to specified in the file associations. Use it if you don't want to register a new mime type, but reuse existing.</li>
<li><code id="LinuxTargetSpecificOptions-desktop">desktop</code> any | "undefined" - The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries (name to value).</li>
<li><code id="LinuxTargetSpecificOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | "undefined" - The executable parameters. Pass to executableName</li>
</ul>

Inherited from `TargetSpecificOptions`:

<ul>
<li><code id="LinuxTargetSpecificOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template).</li>
<li><code id="LinuxTargetSpecificOptions-publish">publish</code> The [publish](/configuration/publish) options.</li>
</ul>
