<ul>
<li>**<code id="Metadata-name">name</code>** String - The application name.</li>
<li><code id="Metadata-description">description</code> String - The application description.</li>
<li><code id="Metadata-homepage">homepage</code> String | "undefined" - The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).
    
    If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
</li>
<li><code id="Metadata-license">license</code> String | "undefined" - *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.</li>
<li><code id="Metadata-author">author</code> [AuthorMetadata](#AuthorMetadata) | "undefined"</li>
<li><code id="Metadata-repository">repository</code> String | [RepositoryInfo](#RepositoryInfo) | "undefined" - The [repository](https://docs.npmjs.com/files/package.json#repository).</li>
<li><code id="Metadata-build">build</code> [Configuration](#configuration) - The electron-builder configuration.</li>
</ul>
