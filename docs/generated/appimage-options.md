<ul>
<li><code id="AppImageOptions-license">license</code> String | “undefined” - The path to EULA license file. Defaults to <code>license.txt</code> or <code>eula.txt</code> (or uppercase variants). Only plain text is supported.</li>
</ul>
<p>Inherited from <code>CommonLinuxOptions</code>:</p>
<ul>
<li><code id="AppImageOptions-synopsis">synopsis</code> String | “undefined” - The <a href="https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description">short description</a>.</li>
<li><code id="AppImageOptions-description">description</code> String | “undefined” - As <a href="/configuration/configuration#Metadata-description">description</a> from application package.json, but allows you to specify different for Linux.</li>
<li><code id="AppImageOptions-category">category</code> String | “undefined” - The <a href="https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry">application category</a>.</li>
<li><code id="AppImageOptions-mimeTypes">mimeTypes</code> Array&lt;String&gt; | “undefined” - The mime types in addition to specified in the file associations. Use it if you don’t want to register a new mime type, but reuse existing.</li>
<li><code id="AppImageOptions-desktop">desktop</code> any | “undefined” - The <a href="https://developer.gnome.org/integration-guide/stable/desktop-files.html.en">Desktop file</a> entries (name to value).</li>
<li><code id="AppImageOptions-executableArgs">executableArgs</code> Array&lt;String&gt; | “undefined” - The executable parameters. Pass to executableName</li>
</ul>
<p>Inherited from <code>TargetSpecificOptions</code>:</p>
<ul>
<li><code id="AppImageOptions-artifactName">artifactName</code> String | “undefined” - The <a href="/configuration/configuration#artifact-file-name-template">artifact file name template</a>.</li>
<li><code id="AppImageOptions-publish">publish</code> The <a href="/configuration/publish">publish</a> options.</li>
</ul>
