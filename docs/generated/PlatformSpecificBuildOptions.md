<ul>
<li>
<p><code id="PlatformSpecificBuildOptions-appId">appId</code> = <code>com.electron.${name}</code> String | “undefined” - The application id. Used as <a href="https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070">CFBundleIdentifier</a> for MacOS and as <a href="https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx">Application User Model ID</a> for Windows (NSIS target only, Squirrel.Windows not supported). It is strongly recommended that an explicit ID is set.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-artifactName">artifactName</code> String | “undefined” - The <a href="/configuration/configuration#artifact-file-name-template">artifact file name template</a>. Defaults to <code>${productName}-${version}.${ext}</code> (some target can have other defaults, see corresponding options).</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-executableName">executableName</code> String | “undefined” - The executable name. Defaults to <code>productName</code>.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-compression">compression</code> = <code>normal</code> “store” | “normal” | “maximum” | “undefined” - The compression level. If you want to rapidly test build, <code>store</code> can reduce build time significantly. <code>maximum</code> doesn’t lead to noticeable size difference, but increase build time.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-files">files</code> The <a href="/configuration/contents#files">files</a> configuration.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-extraResources">extraResources</code> The <a href="/configuration/contents#extraresources">extra resources</a> configuration.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-extraFiles">extraFiles</code> The <a href="/configuration/contents#extrafiles">extra files</a> configuration.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-asar">asar</code> = <code>true</code> <a href="#AsarOptions">AsarOptions</a> | Boolean | “undefined” - Whether to package the application’s source code into an archive, using <a href="http://electron.atom.io/docs/tutorial/application-packaging/">Electron’s archive format</a>.</p>
<p>Node modules, that must be unpacked, will be detected automatically, you don’t need to explicitly set <a href="#configuration-asarUnpack">asarUnpack</a> - please file an issue if this doesn’t work.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-asarUnpack">asarUnpack</code> Array&lt;String&gt; | String | “undefined” - A <a href="/file-patterns">glob patterns</a> relative to the <a href="#MetadataDirectories-app">app directory</a>, which specifies which files to unpack when creating the <a href="http://electron.atom.io/docs/tutorial/application-packaging/">asar</a> archive.</p>
</li>
</ul>
<hr>
<ul>
<li><code id="PlatformSpecificBuildOptions-fileAssociations">fileAssociations</code> Array&lt;FileAssociation&gt; | FileAssociation<a name="FileAssociation"></a> - The file associations.
<ul>
<li>
<p><strong><code id="FileAssociation-ext">ext</code></strong> String | Array&lt;String&gt; - The extension (minus the leading period). e.g. <code>png</code>.</p>
</li>
<li>
<p><code id="FileAssociation-name">name</code> String | “undefined” - The name. e.g. <code>PNG</code>. Defaults to <code>ext</code>.</p>
</li>
<li>
<p><code id="FileAssociation-description">description</code> String | “undefined” - <em>windows-only.</em> The description.</p>
</li>
<li>
<p><code id="FileAssociation-mimeType">mimeType</code> String | “undefined” - <em>linux-only.</em> The mime-type.</p>
</li>
<li>
<p><code id="FileAssociation-icon">icon</code> String | “undefined” - The path to icon (<code>.icns</code> for MacOS and <code>.ico</code> for Windows), relative to <code>build</code> (build resources directory). Defaults to <code>${firstExt}.icns</code>/<code>${firstExt}.ico</code> (if several extensions specified, first is used) or to application icon.</p>
<p>Not supported on Linux, file issue if need (default icon will be <code>x-office-document</code>).</p>
</li>
<li>
<p><code id="FileAssociation-role">role</code> = <code>Editor</code> String - <em>macOS-only</em> The app’s role with respect to the type. The value can be <code>Editor</code>, <code>Viewer</code>, <code>Shell</code>, or <code>None</code>. Corresponds to <code>CFBundleTypeRole</code>.</p>
</li>
<li>
<p><code id="FileAssociation-isPackage">isPackage</code> Boolean - <em>macOS-only</em> Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to <code>LSTypeIsPackage</code>.</p>
</li>
<li>
<p><code id="FileAssociation-rank">rank</code> = <code>Default</code> String - <em>macOS-only</em> The app’s rank with respect to the type. The value can be <code>Owner</code>, <code>Default</code>, <code>Alternate</code>, or <code>None</code>. Corresponds to <code>LSHandlerRank</code>.</p>
</li>
</ul>
</li>
<li><code id="PlatformSpecificBuildOptions-protocols">protocols</code> Array&lt;Protocol&gt; | Protocol<a name="Protocol"></a> - The URL protocol schemes.
<ul>
<li><strong><code id="Protocol-name">name</code></strong> String - The name. e.g. <code>IRC server URL</code>.</li>
<li><strong><code id="Protocol-schemes">schemes</code></strong> Array&lt;String&gt; - The schemes. e.g. <code>[&quot;irc&quot;, &quot;ircs&quot;]</code>.</li>
<li><code id="Protocol-role">role</code> = <code>Editor</code> “Editor” | “Viewer” | “Shell” | “None” - <em>macOS-only</em> The app’s role with respect to the type.</li>
</ul>
</li>
</ul>
<hr>
<ul>
<li>
<p><code id="PlatformSpecificBuildOptions-forceCodeSigning">forceCodeSigning</code> Boolean - Whether to fail if app will be not code signed.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-electronUpdaterCompatibility">electronUpdaterCompatibility</code> String | “undefined” - The <a href="/auto-update#compatibility">electron-updater compatibility</a> semver range.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-publish">publish</code> The <a href="/configuration/publish">publish</a> options.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-detectUpdateChannel">detectUpdateChannel</code> = <code>true</code> Boolean - Whether to infer update channel from application version pre-release components. e.g. if version <code>0.12.1-alpha.1</code>, channel will be set to <code>alpha</code>. Otherwise to <code>latest</code>.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-generateUpdatesFilesForAllChannels">generateUpdatesFilesForAllChannels</code> = <code>false</code> Boolean - Please see <a href="https://github.com/electron-userland/electron-builder/issues/1182#issuecomment-324947139">Building and Releasing using Channels</a>.</p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-releaseInfo">releaseInfo</code><a name="ReleaseInfo"></a> - The release info. Intended for command line usage:</p>
<p><code>-c.releaseInfo.releaseNotes=&quot;new features&quot;</code></p>
<ul>
<li><code id="ReleaseInfo-releaseName">releaseName</code> String | “undefined” - The release name.</li>
<li><code id="ReleaseInfo-releaseNotes">releaseNotes</code> String | “undefined” - The release notes.</li>
<li><code id="ReleaseInfo-releaseNotesFile">releaseNotesFile</code> String | “undefined” - The path to release notes file. Defaults to <code>release-notes-${platform}.md</code> (where <code>platform</code> it is current platform — <code>mac</code>, <code>linux</code> or <code>windows</code>) or <code>release-notes.md</code> in the <a href="#MetadataDirectories-buildResources">build resources</a>.</li>
<li><code id="ReleaseInfo-releaseDate">releaseDate</code> String - The release date.</li>
</ul>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-target">target</code> String | <a href="/cli#targetconfiguration">TargetConfiguration</a></p>
</li>
<li>
<p><code id="PlatformSpecificBuildOptions-defaultArch">defaultArch</code> String</p>
</li>
</ul>
