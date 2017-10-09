* <code id="PlatformSpecificBuildOptions-artifactName">artifactName</code> String - The [artifact file name template](/configuration/configuration.md#artifact-file-name-template). Defaults to `${productName}-${version}.${ext}` (some target can have other defaults, see corresponding options).
* <code id="PlatformSpecificBuildOptions-compression">compression</code> = `normal` "store" | "normal" | "maximum" - The compression level. If you want to rapidly test build, `store` can reduce build time significantly. `maximum` doesn't lead to noticeable size difference, but increase build time.
* <code id="PlatformSpecificBuildOptions-files">files</code> The [files](/configuration/contents.md#files) configuration.
* <code id="PlatformSpecificBuildOptions-extraResources">extraResources</code> The [extra resources](/configuration/contents.md#extraresources) configuration.
* <code id="PlatformSpecificBuildOptions-extraFiles">extraFiles</code> The [extra files](/configuration/contents.md#extrafiles) configuration.
* <code id="PlatformSpecificBuildOptions-asar">asar</code> = `true` AsarOptions | Boolean<a name="AsarOptions"></a> - Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).
  
  Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#configuration-asarUnpack) - please file an issue if this doesn't work.
  * <code id="AsarOptions-smartUnpack">smartUnpack</code> = `true` Boolean - Whether to automatically unpack executables files.
  * <code id="AsarOptions-ordering">ordering</code> String
* <code id="PlatformSpecificBuildOptions-asarUnpack">asarUnpack</code> Array&lt;String&gt; | String - A [glob patterns](/file-patterns.md) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.

---

* <code id="PlatformSpecificBuildOptions-fileAssociations">fileAssociations</code> Array&lt;FileAssociation&gt; | FileAssociation<a name="FileAssociation"></a> - The file associations.
  * **<code id="FileAssociation-ext">ext</code>** String | Array&lt;String&gt; - The extension (minus the leading period). e.g. `png`.
  * <code id="FileAssociation-name">name</code> String - The name. e.g. `PNG`. Defaults to `ext`.
  * <code id="FileAssociation-description">description</code> String - *windows-only.* The description.
  * <code id="FileAssociation-icon">icon</code> String - The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
  * <code id="FileAssociation-role">role</code> = `Editor` String - *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Corresponds to `CFBundleTypeRole`.
  * <code id="FileAssociation-isPackage">isPackage</code> Boolean - *macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`.
* <code id="PlatformSpecificBuildOptions-protocols">protocols</code> Array&lt;Protocol&gt; | Protocol<a name="Protocol"></a> - The URL protocol schemes.
  * **<code id="Protocol-name">name</code>** String - The name. e.g. `IRC server URL`.
  * **<code id="Protocol-schemes">schemes</code>** Array&lt;String&gt; - The schemes. e.g. `["irc", "ircs"]`.
  * <code id="Protocol-role">role</code> = `Editor` "Editor" | "Viewer" | "Shell" | "None" - *macOS-only* The app’s role with respect to the type.

---

* <code id="PlatformSpecificBuildOptions-forceCodeSigning">forceCodeSigning</code> Boolean
* <code id="PlatformSpecificBuildOptions-publish">publish</code> The [publish](/configuration/publish.md) options.
* <code id="PlatformSpecificBuildOptions-detectUpdateChannel">detectUpdateChannel</code> = `true` Boolean - Whether to infer update channel from application version pre-release components. e.g. if version `0.12.1-alpha.1`, channel will be set to `alpha`. Otherwise to `latest`.
* <code id="PlatformSpecificBuildOptions-generateUpdatesFilesForAllChannels">generateUpdatesFilesForAllChannels</code> = `false` Boolean - Please see [Building and Releasing using Channels](https://github.com/electron-userland/electron-builder/issues/1182#issuecomment-324947139).
* <code id="PlatformSpecificBuildOptions-releaseInfo">releaseInfo</code><a name="ReleaseInfo"></a> - The release info. Intended for command line usage:
  
  ``` -c.releaseInfo.releaseNotes="new features" ```
  * <code id="ReleaseInfo-releaseName">releaseName</code> String - The release name.
  * <code id="ReleaseInfo-releaseNotes">releaseNotes</code> String - The release notes.
  * <code id="ReleaseInfo-releaseNotesFile">releaseNotesFile</code> String - The path to release notes file. Defaults to `release-notes-${platform}.md` (where `platform` it is current platform — `mac`, `linux` or `windows`) or `release-notes.md` in the [build resources](#MetadataDirectories-buildResources).
  * <code id="ReleaseInfo-releaseDate">releaseDate</code> String - The release date.
* <code id="PlatformSpecificBuildOptions-target">target</code> String | [TargetConfiguration](/configuration/target.md#targetconfiguration)