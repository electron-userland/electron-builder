<ul>
<li>
<p><strong><code id="Metadata-name">name</code></strong> String - The application name.</p>
</li>
<li>
<p><code id="Metadata-description">description</code> String - The application description.</p>
</li>
<li>
<p><code id="Metadata-homepage">homepage</code> String | “undefined” - The url to the project <a href="https://docs.npmjs.com/files/package.json#homepage">homepage</a> (NuGet Package <code>projectUrl</code> (optional) or Linux Package URL (required)).</p>
<p>If not specified and your project repository is public on GitHub, it will be <code>https://github.com/${user}/${project}</code> by default.</p>
</li>
<li>
<p><code id="Metadata-license">license</code> String | “undefined” - <em>linux-only.</em> The <a href="https://docs.npmjs.com/files/package.json#license">license</a> name.</p>
</li>
<li>
<p><code id="Metadata-author">author</code> <a href="#AuthorMetadata">AuthorMetadata</a> | “undefined”</p>
</li>
<li>
<p><code id="Metadata-repository">repository</code> String | <a href="#RepositoryInfo">RepositoryInfo</a> | “undefined” - The <a href="https://docs.npmjs.com/files/package.json#repository">repository</a>.</p>
</li>
<li>
<p><code id="Metadata-build">build</code> <a href="#configuration">Configuration</a> - The electron-builder configuration.</p>
</li>
</ul>
