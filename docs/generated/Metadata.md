* **<code id="Metadata-name">name</code>** String - The application name.
* <code id="Metadata-description">description</code> String - The application description.
* <code id="Metadata-homepage">homepage</code> String - The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).
  
  If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
* <code id="Metadata-license">license</code> String - *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.
* <code id="Metadata-author">author</code><a name="AuthorMetadata"></a>
  * **<code id="AuthorMetadata-name">name</code>** String
  * <code id="AuthorMetadata-email">email</code> String
* <code id="Metadata-repository">repository</code> String | RepositoryInfo<a name="RepositoryInfo"></a> - The [repository](https://docs.npmjs.com/files/package.json#repository).
  * **<code id="RepositoryInfo-url">url</code>** String
* <code id="Metadata-build">build</code> [Configuration](#configuration) - The electron-builder configuration.