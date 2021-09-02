<ul>
<li>
<p><code id="LinuxTargetSpecificOptions-depends">depends</code> Array&lt;String&gt; | “undefined” - Package dependencies.</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-compression">compression</code> = <code>xz</code> “gz” | “bzip2” | “xz” | “undefined” - The compression type.</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-icon">icon</code> String</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-packageCategory">packageCategory</code> String | “undefined” - The package category.</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-packageName">packageName</code> String | “undefined” - The name of the package.</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-vendor">vendor</code> String | “undefined”</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-maintainer">maintainer</code> String | “undefined”</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-afterInstall">afterInstall</code> String | “undefined”</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-afterRemove">afterRemove</code> String | “undefined”</p>
</li>
<li>
<p><code id="LinuxTargetSpecificOptions-fpm">fpm</code> Array&lt;String&gt; | “undefined” - <em>Advanced only</em> The <a href="https://github.com/jordansissel/fpm/wiki#usage">fpm</a> options.</p>
<p>Example: <code>[&quot;--before-install=build/deb-preinstall.sh&quot;, &quot;--after-upgrade=build/deb-postinstall.sh&quot;]</code></p>
</li>
</ul>
<p>Inherited from <code>CommonLinuxOptions</code>:</p>
<ul>
<li><code id="LinuxTargetSpecificOptions-synopsis">synopsis</code> String | “undefined” - The <a href="https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description">short description</a>.</li>
<li><code id="LinuxTargetSpecificOptions-description">description</code> String | “undefined” - As <a href="/configuration/configuration#Metadata-description">description</a> from application package.json, but allows you to specify different for Linux.</li>
<li><code id="LinuxTargetSpecificOptions-category">category</code> String | “undefined” - The <a href="https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry">application category</a>.</li>
<li><code id="LinuxTargetSpecificOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | “undefined” - The mime types in addition to specified in the file associations. Use it if you don’t want to register a new mime type, but reuse existing.</li>
<li><code id="LinuxTargetSpecificOptions-desktop">desktop</code> any | “undefined” - The <a href="https://developer.gnome.org/integration-guide/stable/desktop-files.html.en">Desktop file</a> entries (name to value).</li>
<li><code id="LinuxTargetSpecificOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | “undefined” - The executable parameters. Pass to executableName</li>
</ul>
<p>Inherited from <code>TargetSpecificOptions</code>:</p>
<ul>
<li><code id="LinuxTargetSpecificOptions-artifactName">artifactName</code> String | “undefined” - The <a href="/configuration/configuration#artifact-file-name-template">artifact file name template</a>.</li>
<li><code id="LinuxTargetSpecificOptions-publish">publish</code> The <a href="/configuration/publish">publish</a> options.</li>
</ul>
