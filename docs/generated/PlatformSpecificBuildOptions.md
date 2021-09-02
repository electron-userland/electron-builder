<ul>
<li><code id="PlatformSpecificBuildOptions-appId">appId</code> = `com.electron.${name}` String | "undefined" - The application id. Used as [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.</li>
<li><code id="PlatformSpecificBuildOptions-artifactName">artifactName</code> String | "undefined" - The [artifact file name template](/configuration/configuration#artifact-file-name-template). Defaults to `${productName}-${version}.${ext}` (some target can have other defaults, see corresponding options).</li>
<li><code id="PlatformSpecificBuildOptions-executableName">executableName</code> String | "undefined" - The executable name. Defaults to `productName`.</li>
<li><code id="PlatformSpecificBuildOptions-compression">compression</code> = `normal` "store" | "normal" | "maximum" | "undefined" - The compression level. If you want to rapidly test build, `store` can reduce build time significantly. `maximum` doesn't lead to noticeable size difference, but increase build time.</li>
<li><code id="PlatformSpecificBuildOptions-files">files</code> The [files](/configuration/contents#files) configuration.</li>
<li><code id="PlatformSpecificBuildOptions-extraResources">extraResources</code> The [extra resources](/configuration/contents#extraresources) configuration.</li>
<li><code id="PlatformSpecificBuildOptions-extraFiles">extraFiles</code> The [extra files](/configuration/contents#extrafiles) configuration.</li>
<li><code id="PlatformSpecificBuildOptions-asar">asar</code> = `true` [AsarOptions](#AsarOptions) | Boolean | "undefined" - Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/).
    
    Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set [asarUnpack](#configuration-asarUnpack) - please file an issue if this doesn't work.
</li>
<li><code id="PlatformSpecificBuildOptions-asarUnpack">asarUnpack</code> Array&lt;String&gt; | String | "undefined" - A [glob patterns](/file-patterns) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.</li>

---

<li><code id="PlatformSpecificBuildOptions-fileAssociations">fileAssociations</code> Array&lt;FileAssociation&gt; | FileAssociation<a name="FileAssociation"></a> - The file associations.
<ul>
<li>**<code id="FileAssociation-ext">ext</code>** String | Array&lt;String&gt; - The extension (minus the leading period). e.g. `png`.</li>
<li><code id="FileAssociation-name">name</code> String | "undefined" - The name. e.g. `PNG`. Defaults to `ext`.</li>
<li><code id="FileAssociation-description">description</code> String | "undefined" - *windows-only.* The description.</li>
<li><code id="FileAssociation-mimeType">mimeType</code> String | "undefined" - *linux-only.* The mime-type.</li>
<li><code id="FileAssociation-icon">icon</code> String | "undefined" - The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
        
        Not supported on Linux, file issue if need (default icon will be `x-office-document`).
</li>
<li><code id="FileAssociation-role">role</code> = `Editor` String - *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Corresponds to `CFBundleTypeRole`.</li>
<li><code id="FileAssociation-isPackage">isPackage</code> Boolean - *macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`.</li>
<li><code id="FileAssociation-rank">rank</code> = `Default` String - *macOS-only* The app’s rank with respect to the type. The value can be `Owner`, `Default`, `Alternate`, or `None`. Corresponds to `LSHandlerRank`.</li>
</ul></li>
<li><code id="PlatformSpecificBuildOptions-protocols">protocols</code> Array&lt;Protocol&gt; | Protocol<a name="Protocol"></a> - The URL protocol schemes.
<ul>
<li>**<code id="Protocol-name">name</code>** String - The name. e.g. `IRC server URL`.</li>
<li>**<code id="Protocol-schemes">schemes</code>** Array&lt;String&gt; - The schemes. e.g. `["irc", "ircs"]`.</li>
<li><code id="Protocol-role">role</code> = `Editor` "Editor" | "Viewer" | "Shell" | "None" - *macOS-only* The app’s role with respect to the type.</li>
</ul></li>

---

<li><code id="PlatformSpecificBuildOptions-forceCodeSigning">forceCodeSigning</code> Boolean - Whether to fail if app will be not code signed.</li>
<li><code id="PlatformSpecificBuildOptions-electronUpdaterCompatibility">electronUpdaterCompatibility</code> String | "undefined" - The [electron-updater compatibility](/auto-update#compatibility) semver range.</li>
<li><code id="PlatformSpecificBuildOptions-publish">publish</code> The [publish](/configuration/publish) options.</li>
<li><code id="PlatformSpecificBuildOptions-detectUpdateChannel">detectUpdateChannel</code> = `true` Boolean - Whether to infer update channel from application version pre-release components. e.g. if version `0.12.1-alpha.1`, channel will be set to `alpha`. Otherwise to `latest`.</li>
<li><code id="PlatformSpecificBuildOptions-generateUpdatesFilesForAllChannels">generateUpdatesFilesForAllChannels</code> = `false` Boolean - Please see [Building and Releasing using Channels](https://github.com/electron-userland/electron-builder/issues/1182#issuecomment-324947139).</li>
<li><code id="PlatformSpecificBuildOptions-releaseInfo">releaseInfo</code><a name="ReleaseInfo"></a> - The release info. Intended for command line usage:
    
    ``` -c.releaseInfo.releaseNotes="new features" ```

<ul>
<li><code id="ReleaseInfo-releaseName">releaseName</code> String | "undefined" - The release name.</li>
<li><code id="ReleaseInfo-releaseNotes">releaseNotes</code> String | "undefined" - The release notes.</li>
<li><code id="ReleaseInfo-releaseNotesFile">releaseNotesFile</code> String | "undefined" - The path to release notes file. Defaults to `release-notes-${platform}.md` (where `platform` it is current platform — `mac`, `linux` or `windows`) or `release-notes.md` in the [build resources](#MetadataDirectories-buildResources).</li>
<li><code id="ReleaseInfo-releaseDate">releaseDate</code> String - The release date.</li>
</ul></li>
<li><code id="PlatformSpecificBuildOptions-target">target</code> String | [TargetConfiguration](/cli#targetconfiguration)</li>
<li><code id="PlatformSpecificBuildOptions-defaultArch">defaultArch</code> String</li>
</ul>
