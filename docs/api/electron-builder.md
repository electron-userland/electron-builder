Developer API only. See [Configuration](../configuration/configuration.md) for user documentation.
  
<!-- do not edit. start of generated block -->
<h1 id="modules">Modules</h1>
<dl>
<dt><a href="#module_electron-builder">electron-builder</a></dt>
<dd></dd>
<dt><a href="#module_app-builder-lib">app-builder-lib</a></dt>
<dd></dd>
<dt><a href="#module_electron-publish">electron-publish</a></dt>
<dd></dd>
<dt><a href="#module_electron-updater">electron-updater</a></dt>
<dd></dd>
</dl>
<p><a name="module_electron-builder"></a></p>
<h1 id="electron-builder">electron-builder</h1>
<ul>
<li><a href="#module_electron-builder">electron-builder</a>
<ul>
<li><a href="#Arch"><code>.Arch</code></a> : <code>enum</code></li>
<li><a href="#module_electron-builder.build"><code>.build(rawOptions)</code></a> ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code></li>
<li><a href="#module_electron-builder.createTargets"><code>.createTargets(platforms, type, arch)</code></a> ⇒ <code>Map&lt;Platform | Map&lt;<a href="#Arch">Arch</a> | Array&lt;String&gt;&gt;&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="Arch"></a></p>
<h2 id="electron-builder.arch-%3A-enum"><code>electron-builder.Arch</code> : <code>enum</code></h2>
<p><strong>Kind</strong>: enum of <a href="#module_electron-builder"><code>electron-builder</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="Arch-ia32">ia32</code></strong></li>
<li><strong><code id="Arch-x64">x64</code></strong></li>
<li><strong><code id="Arch-armv7l">armv7l</code></strong></li>
<li><strong><code id="Arch-arm64">arm64</code></strong></li>
<li><strong><code id="Arch-universal">universal</code></strong></li>
</ul>
<p><a name="module_electron-builder.build"></a></p>
<h2 id="electron-builder.build(rawoptions)-%E2%87%92-promise%3Carray%3Cstring%3E%3E"><code>electron-builder.build(rawOptions)</code> ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code></h2>
<p><strong>Kind</strong>: method of <a href="#module_electron-builder"><code>electron-builder</code></a><br/></p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>rawOptions</td>
<td><code><a href="#CliOptions">CliOptions</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-builder.createTargets"></a></p>
<h2 id="electron-builder.createtargets(platforms%2C-type%2C-arch)-%E2%87%92-map%3Cplatform-%7C-map%3Carch-%7C-array%3Cstring%3E%3E%3E"><code>electron-builder.createTargets(platforms, type, arch)</code> ⇒ <code>Map&lt;Platform | Map&lt;<a href="#Arch">Arch</a> | Array&lt;String&gt;&gt;&gt;</code></h2>
<p><strong>Kind</strong>: method of <a href="#module_electron-builder"><code>electron-builder</code></a><br/></p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>platforms</td>
<td><code>Array&lt;Platform&gt;</code></td>
</tr>
<tr>
<td>type</td>
<td><code>String</code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>arch</td>
<td><code>String</code> | <code>“undefined”</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib"></a></p>
<h1 id="app-builder-lib">app-builder-lib</h1>
<ul>
<li><a href="#module_app-builder-lib">app-builder-lib</a>
<ul>
<li><a href="#ArtifactBuildStarted"><code>.ArtifactBuildStarted</code></a></li>
<li><a href="#ArtifactCreated"><code>.ArtifactCreated</code></a> ⇐ <code>module:packages/electron-publish/out/publisher.UploadTask</code></li>
<li><a href="#BeforeBuildContext"><code>.BeforeBuildContext</code></a></li>
<li><a href="#BuildResult"><code>.BuildResult</code></a></li>
<li><a href="#CertificateFromStoreInfo"><code>.CertificateFromStoreInfo</code></a></li>
<li><a href="#FileCodeSigningInfo"><code>.FileCodeSigningInfo</code></a></li>
<li><a href="#Framework"><code>.Framework</code></a>
<ul>
<li><a href="#module_app-builder-lib.Framework+afterPack"><code>.afterPack(context)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Framework+beforeCopyExtraFiles"><code>.beforeCopyExtraFiles(options)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Framework+createTransformer"><code>.createTransformer()</code></a> ⇒ <code>null</code> | <code>module:packages/builder-util/out/fs.__type</code></li>
<li><a href="#module_app-builder-lib.Framework+getDefaultIcon"><code>.getDefaultIcon(platform)</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.Framework+getExcludedDependencies"><code>.getExcludedDependencies(platform)</code></a> ⇒ <code>null</code> | <code>Array</code></li>
<li><a href="#module_app-builder-lib.Framework+getMainFile"><code>.getMainFile(platform)</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.Framework+prepareApplicationStageDirectory"><code>.prepareApplicationStageDirectory(options)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
</ul>
</li>
<li><a href="#SourceRepositoryInfo"><code>.SourceRepositoryInfo</code></a></li>
<li><a href="#AppInfo">.AppInfo</a>
<ul>
<li><a href="#module_app-builder-lib.AppInfo+computePackageUrl"><code>.computePackageUrl()</code></a> ⇒ <code>Promise&lt; | String&gt;</code></li>
<li><a href="#module_app-builder-lib.AppInfo+getVersionInWeirdWindowsForm"><code>.getVersionInWeirdWindowsForm(isSetBuildNumber)</code></a> ⇒ <code>String</code></li>
</ul>
</li>
<li><a href="#Packager">.Packager</a>
<ul>
<li><a href="#module_app-builder-lib.Packager+_build"><code>._build(configuration, metadata, devMetadata, repositoryInfo)</code></a> ⇒ <code>Promise&lt;<a href="#BuildResult">BuildResult</a>&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+addAfterPackHandler"><code>.addAfterPackHandler(handler)</code></a></li>
<li><a href="#module_app-builder-lib.Packager+afterPack"><code>.afterPack(context)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+artifactCreated"><code>.artifactCreated(handler)</code></a> ⇒ <code><a href="#Packager">Packager</a></code></li>
<li><a href="#module_app-builder-lib.Packager+build"><code>.build()</code></a> ⇒ <code>Promise&lt;<a href="#BuildResult">BuildResult</a>&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callAppxManifestCreated"><code>.callAppxManifestCreated(path)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callArtifactBuildCompleted"><code>.callArtifactBuildCompleted(event)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callArtifactBuildStarted"><code>.callArtifactBuildStarted(event, logFields)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callMsiProjectCreated"><code>.callMsiProjectCreated(path)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+dispatchArtifactCreated"><code>.dispatchArtifactCreated(event)</code></a></li>
<li><a href="#module_app-builder-lib.Packager+disposeOnBuildFinish"><code>.disposeOnBuildFinish(disposer)</code></a></li>
<li><a href="#module_app-builder-lib.Packager+installAppDependencies"><code>.installAppDependencies(platform, arch)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+getNodeDependencyInfo"><code>.getNodeDependencyInfo(platform)</code></a> ⇒ <code>Lazy&lt;Array&lt;module:app-builder-lib/out/util/packageDependencies.NodeModuleDirInfo&gt;&gt;</code></li>
</ul>
</li>
<li><a href="#Platform">.Platform</a>
<ul>
<li><a href="#module_app-builder-lib.Platform+createTarget"><code>.createTarget(type, archs)</code></a> ⇒ <code>Map&lt;<a href="#Platform">Platform</a> | Map&lt;<a href="#Arch">Arch</a> | Array&lt;String&gt;&gt;&gt;</code></li>
<li><a href="#module_app-builder-lib.Platform+current"><code>.current()</code></a> ⇒ <code><a href="#Platform">Platform</a></code></li>
<li><a href="#module_app-builder-lib.Platform+fromString"><code>.fromString(name)</code></a> ⇒ <code><a href="#Platform">Platform</a></code></li>
<li><a href="#module_app-builder-lib.Platform+toString"><code>.toString()</code></a> ⇒ <code>String</code></li>
</ul>
</li>
<li><a href="#PlatformPackager">.PlatformPackager</a>
<ul>
<li><a href="#module_app-builder-lib.PlatformPackager+artifactPatternConfig"><code>.artifactPatternConfig(targetSpecificOptions, defaultPattern)</code></a> ⇒ <code>module:app-builder-lib/out/platformPackager.__object</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+computeSafeArtifactName"><code>.computeSafeArtifactName(suggestedName, ext, arch, skipDefaultArch, defaultArch, safePattern)</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+createTargets"><code>.createTargets(targets, mapper)</code></a></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getDefaultFrameworkIcon"><code>.getDefaultFrameworkIcon()</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+dispatchArtifactCreated"><code>.dispatchArtifactCreated(file, target, arch, safeArtifactName)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getElectronDestinationDir"><code>.getElectronDestinationDir(appOutDir)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getElectronSrcDir"><code>.getElectronSrcDir(dist)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+expandArtifactBeautyNamePattern"><code>.expandArtifactBeautyNamePattern(targetSpecificOptions, ext, arch)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+expandArtifactNamePattern"><code>.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipDefaultArch, defaultArch)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+expandMacro"><code>.expandMacro(pattern, arch, extra, isProductNameSanitized)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+generateName2"><code>.generateName2(ext, classifier, deployment)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getIconPath"><code>.getIconPath()</code></a> ⇒ <code>Promise&lt; | String&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getMacOsResourcesDir"><code>.getMacOsResourcesDir(appOutDir)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+pack"><code>.pack(outDir, arch, targets, taskManager)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+resolveIcon"><code>.resolveIcon(sources, fallbackSources, outputFormat)</code></a> ⇒ <code>Promise&lt;Array&lt;module:app-builder-lib/out/platformPackager.IconInfo&gt;&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getResource"><code>.getResource(custom, names)</code></a> ⇒ <code>Promise&lt; | String&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getResourcesDir"><code>.getResourcesDir(appOutDir)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getTempFile"><code>.getTempFile(suffix)</code></a> ⇒ <code>Promise&lt;String&gt;</code></li>
</ul>
</li>
<li><a href="#PublishManager">.PublishManager</a> ⇐ <code>module:packages/electron-publish/out/publisher.PublishContext</code>
<ul>
<li><a href="#module_app-builder-lib.PublishManager+awaitTasks"><code>.awaitTasks()</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.PublishManager+cancelTasks"><code>.cancelTasks()</code></a></li>
<li><a href="#module_app-builder-lib.PublishManager+getGlobalPublishConfigurations"><code>.getGlobalPublishConfigurations()</code></a> ⇒ <code>Promise&lt; | Array&gt;</code></li>
</ul>
</li>
<li><a href="#Target">.Target</a>
<ul>
<li><a href="#module_app-builder-lib.Target+build"><code>.build(appOutDir, arch)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Target+finishBuild"><code>.finishBuild()</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
</ul>
</li>
<li><a href="#module_app-builder-lib.build"><code>.build(options, packager)</code></a> ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code></li>
<li><a href="#module_app-builder-lib.buildForge"><code>.buildForge(forgeOptions, options)</code></a> ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="ArtifactBuildStarted"></a></p>
<h2 id="artifactbuildstarted"><code>ArtifactBuildStarted</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="ArtifactBuildStarted-targetPresentableName">targetPresentableName</code></strong> String</li>
<li><strong><code id="ArtifactBuildStarted-file">file</code></strong> String</li>
<li><strong><code id="ArtifactBuildStarted-arch">arch</code></strong> <a href="#Arch">Arch</a> | “undefined”</li>
</ul>
<p><a name="ArtifactCreated"></a></p>
<h2 id="artifactcreated-%E2%87%90-module%3Apackages%2Felectron-publish%2Fout%2Fpublisher.uploadtask"><code>ArtifactCreated</code> ⇐ <code>module:packages/electron-publish/out/publisher.UploadTask</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Extends</strong>: <code>module:packages/electron-publish/out/publisher.UploadTask</code><br>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="ArtifactCreated-packager">packager</code></strong> <a href="#PlatformPackager">PlatformPackager</a>&lt;any&gt;</li>
<li><strong><code id="ArtifactCreated-target">target</code></strong> <a href="#Target">Target</a> | “undefined”</li>
<li><code id="ArtifactCreated-updateInfo">updateInfo</code> any</li>
<li><code id="ArtifactCreated-safeArtifactName">safeArtifactName</code> String | “undefined”</li>
<li><code id="ArtifactCreated-publishConfig">publishConfig</code> <a href="/configuration/publish#publishconfiguration">PublishConfiguration</a> | “undefined”</li>
<li><code id="ArtifactCreated-isWriteUpdateInfo">isWriteUpdateInfo</code> Boolean</li>
</ul>
<p><a name="BeforeBuildContext"></a></p>
<h2 id="beforebuildcontext"><code>BeforeBuildContext</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="BeforeBuildContext-appDir">appDir</code></strong> String</li>
<li><strong><code id="BeforeBuildContext-electronVersion">electronVersion</code></strong> String</li>
<li><strong><code id="BeforeBuildContext-platform">platform</code></strong> <a href="#Platform">Platform</a></li>
<li><strong><code id="BeforeBuildContext-arch">arch</code></strong> String</li>
</ul>
<p><a name="BuildResult"></a></p>
<h2 id="buildresult"><code>BuildResult</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="BuildResult-outDir">outDir</code></strong> String</li>
<li><strong><code id="BuildResult-artifactPaths">artifactPaths</code></strong> Array&lt;String&gt;</li>
<li><strong><code id="BuildResult-platformToTargets">platformToTargets</code></strong> Map&lt;<a href="#Platform">Platform</a> | Map&lt;String | <a href="#Target">Target</a>&gt;&gt;</li>
<li><strong><code id="BuildResult-configuration">configuration</code></strong> <a href="#Configuration">Configuration</a></li>
</ul>
<p><a name="CertificateFromStoreInfo"></a></p>
<h2 id="certificatefromstoreinfo"><code>CertificateFromStoreInfo</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="CertificateFromStoreInfo-thumbprint">thumbprint</code></strong> String</li>
<li><strong><code id="CertificateFromStoreInfo-subject">subject</code></strong> String</li>
<li><strong><code id="CertificateFromStoreInfo-store">store</code></strong> String</li>
<li><strong><code id="CertificateFromStoreInfo-isLocalMachineStore">isLocalMachineStore</code></strong> Boolean</li>
</ul>
<p><a name="FileCodeSigningInfo"></a></p>
<h2 id="filecodesigninginfo"><code>FileCodeSigningInfo</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="FileCodeSigningInfo-file">file</code></strong> String</li>
<li><strong><code id="FileCodeSigningInfo-password">password</code></strong> String | “undefined”</li>
</ul>
<p><a name="Framework"></a></p>
<h2 id="framework"><code>Framework</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="Framework-name">name</code></strong> String</li>
<li><strong><code id="Framework-version">version</code></strong> String</li>
<li><strong><code id="Framework-distMacOsAppName">distMacOsAppName</code></strong> String</li>
<li><strong><code id="Framework-macOsDefaultTargets">macOsDefaultTargets</code></strong> Array&lt;String&gt;</li>
<li><strong><code id="Framework-defaultAppIdPrefix">defaultAppIdPrefix</code></strong> String</li>
<li><strong><code id="Framework-isNpmRebuildRequired">isNpmRebuildRequired</code></strong> Boolean</li>
<li><strong><code id="Framework-isCopyElevateHelper">isCopyElevateHelper</code></strong> Boolean</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#Framework"><code>.Framework</code></a>
<ul>
<li><a href="#module_app-builder-lib.Framework+afterPack"><code>.afterPack(context)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Framework+beforeCopyExtraFiles"><code>.beforeCopyExtraFiles(options)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Framework+createTransformer"><code>.createTransformer()</code></a> ⇒ <code>null</code> | <code>module:packages/builder-util/out/fs.__type</code></li>
<li><a href="#module_app-builder-lib.Framework+getDefaultIcon"><code>.getDefaultIcon(platform)</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.Framework+getExcludedDependencies"><code>.getExcludedDependencies(platform)</code></a> ⇒ <code>null</code> | <code>Array</code></li>
<li><a href="#module_app-builder-lib.Framework+getMainFile"><code>.getMainFile(platform)</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.Framework+prepareApplicationStageDirectory"><code>.prepareApplicationStageDirectory(options)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="module_app-builder-lib.Framework+afterPack"></a></p>
<h3 id="framework.afterpack(context)-%E2%87%92-promise%3Cany%3E"><code>framework.afterPack(context)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>context</td>
<td><code>module:app-builder-lib/out/configuration.PackContext</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Framework+beforeCopyExtraFiles"></a></p>
<h3 id="framework.beforecopyextrafiles(options)-%E2%87%92-promise%3Cany%3E"><code>framework.beforeCopyExtraFiles(options)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>options</td>
<td><code>module:app-builder-lib/out/Framework.BeforeCopyExtraFilesOptions</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Framework+createTransformer"></a></p>
<h3 id="framework.createtransformer()-%E2%87%92-null-%7C-module%3Apackages%2Fbuilder-util%2Fout%2Ffs.__type"><code>framework.createTransformer()</code> ⇒ <code>null</code> | <code>module:packages/builder-util/out/fs.__type</code></h3>
<p><a name="module_app-builder-lib.Framework+getDefaultIcon"></a></p>
<h3 id="framework.getdefaulticon(platform)-%E2%87%92-null-%7C-string"><code>framework.getDefaultIcon(platform)</code> ⇒ <code>null</code> | <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>platform</td>
<td><code><a href="#Platform">Platform</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Framework+getExcludedDependencies"></a></p>
<h3 id="framework.getexcludeddependencies(platform)-%E2%87%92-null-%7C-array"><code>framework.getExcludedDependencies(platform)</code> ⇒ <code>null</code> | <code>Array</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>platform</td>
<td><code><a href="#Platform">Platform</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Framework+getMainFile"></a></p>
<h3 id="framework.getmainfile(platform)-%E2%87%92-null-%7C-string"><code>framework.getMainFile(platform)</code> ⇒ <code>null</code> | <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>platform</td>
<td><code><a href="#Platform">Platform</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Framework+prepareApplicationStageDirectory"></a></p>
<h3 id="framework.prepareapplicationstagedirectory(options)-%E2%87%92-promise%3Cany%3E"><code>framework.prepareApplicationStageDirectory(options)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>options</td>
<td><code><a href="#PrepareApplicationStageDirectoryOptions">PrepareApplicationStageDirectoryOptions</a></code></td>
</tr>
</tbody>
</table>
<p><a name="SourceRepositoryInfo"></a></p>
<h2 id="sourcerepositoryinfo"><code>SourceRepositoryInfo</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><code id="SourceRepositoryInfo-type">type</code> String</li>
<li><code id="SourceRepositoryInfo-domain">domain</code> String</li>
<li><strong><code id="SourceRepositoryInfo-user">user</code></strong> String</li>
<li><strong><code id="SourceRepositoryInfo-project">project</code></strong> String</li>
</ul>
<p><a name="AppInfo"></a></p>
<h2 id="appinfo">AppInfo</h2>
<p><strong>Kind</strong>: class of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><code id="AppInfo-description">description</code> = <code>smarten(this.info.metadata.description || &quot;&quot;)</code> String</li>
<li><code id="AppInfo-version">version</code> String</li>
<li><code id="AppInfo-shortVersion">shortVersion</code> String | undefined</li>
<li><code id="AppInfo-shortVersionWindows">shortVersionWindows</code> String | undefined</li>
<li><code id="AppInfo-buildNumber">buildNumber</code> String | undefined</li>
<li><code id="AppInfo-buildVersion">buildVersion</code> String</li>
<li><code id="AppInfo-productName">productName</code> String</li>
<li><code id="AppInfo-sanitizedProductName">sanitizedProductName</code> String</li>
<li><code id="AppInfo-productFilename">productFilename</code> String</li>
<li><strong><code id="AppInfo-channel">channel</code></strong> String | “undefined”</li>
<li><strong><code id="AppInfo-companyName">companyName</code></strong> String | “undefined”</li>
<li><strong><code id="AppInfo-id">id</code></strong> String</li>
<li><strong><code id="AppInfo-macBundleIdentifier">macBundleIdentifier</code></strong> String</li>
<li><strong><code id="AppInfo-name">name</code></strong> String</li>
<li><strong><code id="AppInfo-linuxPackageName">linuxPackageName</code></strong> String</li>
<li><strong><code id="AppInfo-sanitizedName">sanitizedName</code></strong> String</li>
<li><strong><code id="AppInfo-updaterCacheDirName">updaterCacheDirName</code></strong> String</li>
<li><strong><code id="AppInfo-copyright">copyright</code></strong> String</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#AppInfo">.AppInfo</a>
<ul>
<li><a href="#module_app-builder-lib.AppInfo+computePackageUrl"><code>.computePackageUrl()</code></a> ⇒ <code>Promise&lt; | String&gt;</code></li>
<li><a href="#module_app-builder-lib.AppInfo+getVersionInWeirdWindowsForm"><code>.getVersionInWeirdWindowsForm(isSetBuildNumber)</code></a> ⇒ <code>String</code></li>
</ul>
</li>
</ul>
<p><a name="module_app-builder-lib.AppInfo+computePackageUrl"></a></p>
<h3 id="appinfo.computepackageurl()-%E2%87%92-promise%3C-%7C-string%3E"><code>appInfo.computePackageUrl()</code> ⇒ <code>Promise&lt; | String&gt;</code></h3>
<p><a name="module_app-builder-lib.AppInfo+getVersionInWeirdWindowsForm"></a></p>
<h3 id="appinfo.getversioninweirdwindowsform(issetbuildnumber)-%E2%87%92-string"><code>appInfo.getVersionInWeirdWindowsForm(isSetBuildNumber)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
</tr>
</thead>
<tbody>
<tr>
<td>isSetBuildNumber</td>
</tr>
</tbody>
</table>
<p><a name="Packager"></a></p>
<h2 id="packager">Packager</h2>
<p><strong>Kind</strong>: class of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><code id="Packager-projectDir">projectDir</code> String</li>
<li><strong><code id="Packager-appDir">appDir</code></strong> String</li>
<li><strong><code id="Packager-metadata">metadata</code></strong> <a href="#Metadata">Metadata</a></li>
<li><strong><code id="Packager-areNodeModulesHandledExternally">areNodeModulesHandledExternally</code></strong> Boolean</li>
<li><strong><code id="Packager-isPrepackedAppAsar">isPrepackedAppAsar</code></strong> Boolean</li>
<li><strong><code id="Packager-devMetadata">devMetadata</code></strong> <a href="#Metadata">Metadata</a> | “undefined”</li>
<li><strong><code id="Packager-config">config</code></strong> <a href="#Configuration">Configuration</a></li>
<li><code id="Packager-isTwoPackageJsonProjectLayoutUsed">isTwoPackageJsonProjectLayoutUsed</code> = <code>false</code> Boolean</li>
<li><code id="Packager-eventEmitter">eventEmitter</code> = <code>new EventEmitter()</code> module:events.EventEmitter</li>
<li><strong><code id="Packager-_appInfo">_appInfo</code></strong> <a href="#AppInfo">AppInfo</a> | “undefined”</li>
<li><strong><code id="Packager-appInfo">appInfo</code></strong> <a href="#AppInfo">AppInfo</a></li>
<li><code id="Packager-tempDirManager">tempDirManager</code> = <code>new TmpDir(&quot;packager&quot;)</code> TmpDir</li>
<li><code id="Packager-options">options</code> <a href="#PackagerOptions">PackagerOptions</a></li>
<li><code id="Packager-debugLogger">debugLogger</code> = <code>new DebugLogger(log.isDebugEnabled)</code> DebugLogger</li>
<li><strong><code id="Packager-repositoryInfo">repositoryInfo</code></strong> Promise&lt; | <a href="#SourceRepositoryInfo">SourceRepositoryInfo</a>&gt;</li>
<li><strong><code id="Packager-[stageDirPathCustomizer=(target, packager, arch) => {
  return path.join(target.outDir, `__${target.name}-${getArtifactArchName(arch, target.name)}`)
}]">[stageDirPathCustomizer=(target, packager, arch) =&gt; {
return path.join(target.outDir, <code>__${target.name}-${getArtifactArchName(arch, target.name)}</code>)
}]</code></strong> callback</li>
<li><strong><code id="Packager-buildResourcesDir">buildResourcesDir</code></strong> String</li>
<li><strong><code id="Packager-relativeBuildResourcesDirname">relativeBuildResourcesDirname</code></strong> String</li>
<li><strong><code id="Packager-framework">framework</code></strong> <a href="#Framework">Framework</a></li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#Packager">.Packager</a>
<ul>
<li><a href="#module_app-builder-lib.Packager+_build"><code>._build(configuration, metadata, devMetadata, repositoryInfo)</code></a> ⇒ <code>Promise&lt;<a href="#BuildResult">BuildResult</a>&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+addAfterPackHandler"><code>.addAfterPackHandler(handler)</code></a></li>
<li><a href="#module_app-builder-lib.Packager+afterPack"><code>.afterPack(context)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+artifactCreated"><code>.artifactCreated(handler)</code></a> ⇒ <code><a href="#Packager">Packager</a></code></li>
<li><a href="#module_app-builder-lib.Packager+build"><code>.build()</code></a> ⇒ <code>Promise&lt;<a href="#BuildResult">BuildResult</a>&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callAppxManifestCreated"><code>.callAppxManifestCreated(path)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callArtifactBuildCompleted"><code>.callArtifactBuildCompleted(event)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callArtifactBuildStarted"><code>.callArtifactBuildStarted(event, logFields)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+callMsiProjectCreated"><code>.callMsiProjectCreated(path)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+dispatchArtifactCreated"><code>.dispatchArtifactCreated(event)</code></a></li>
<li><a href="#module_app-builder-lib.Packager+disposeOnBuildFinish"><code>.disposeOnBuildFinish(disposer)</code></a></li>
<li><a href="#module_app-builder-lib.Packager+installAppDependencies"><code>.installAppDependencies(platform, arch)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Packager+getNodeDependencyInfo"><code>.getNodeDependencyInfo(platform)</code></a> ⇒ <code>Lazy&lt;Array&lt;module:app-builder-lib/out/util/packageDependencies.NodeModuleDirInfo&gt;&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="module_app-builder-lib.Packager+_build"></a></p>
<h3 id="packager._build(configuration%2C-metadata%2C-devmetadata%2C-repositoryinfo)-%E2%87%92-promise%3Cbuildresult%3E"><code>packager._build(configuration, metadata, devMetadata, repositoryInfo)</code> ⇒ <code>Promise&lt;<a href="#BuildResult">BuildResult</a>&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>configuration</td>
<td><code><a href="#Configuration">Configuration</a></code></td>
</tr>
<tr>
<td>metadata</td>
<td><code><a href="#Metadata">Metadata</a></code></td>
</tr>
<tr>
<td>devMetadata</td>
<td><code><a href="#Metadata">Metadata</a></code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>repositoryInfo</td>
<td><code><a href="#SourceRepositoryInfo">SourceRepositoryInfo</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+addAfterPackHandler"></a></p>
<h3 id="packager.addafterpackhandler(handler)"><code>packager.addAfterPackHandler(handler)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>handler</td>
<td><code>callback</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+afterPack"></a></p>
<h3 id="packager.afterpack(context)-%E2%87%92-promise%3Cany%3E"><code>packager.afterPack(context)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>context</td>
<td><code>module:app-builder-lib/out/configuration.PackContext</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+artifactCreated"></a></p>
<h3 id="packager.artifactcreated(handler)-%E2%87%92-packager"><code>packager.artifactCreated(handler)</code> ⇒ <code><a href="#Packager">Packager</a></code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>handler</td>
<td><code>callback</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+build"></a></p>
<h3 id="packager.build()-%E2%87%92-promise%3Cbuildresult%3E"><code>packager.build()</code> ⇒ <code>Promise&lt;<a href="#BuildResult">BuildResult</a>&gt;</code></h3>
<p><a name="module_app-builder-lib.Packager+callAppxManifestCreated"></a></p>
<h3 id="packager.callappxmanifestcreated(path)-%E2%87%92-promise%3Cvoid%3E"><code>packager.callAppxManifestCreated(path)</code> ⇒ <code>Promise&lt;void&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>path</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+callArtifactBuildCompleted"></a></p>
<h3 id="packager.callartifactbuildcompleted(event)-%E2%87%92-promise%3Cvoid%3E"><code>packager.callArtifactBuildCompleted(event)</code> ⇒ <code>Promise&lt;void&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>event</td>
<td><code><a href="#ArtifactCreated">ArtifactCreated</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+callArtifactBuildStarted"></a></p>
<h3 id="packager.callartifactbuildstarted(event%2C-logfields)-%E2%87%92-promise%3Cvoid%3E"><code>packager.callArtifactBuildStarted(event, logFields)</code> ⇒ <code>Promise&lt;void&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>event</td>
<td><code><a href="#ArtifactBuildStarted">ArtifactBuildStarted</a></code></td>
</tr>
<tr>
<td>logFields</td>
<td><code>any</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+callMsiProjectCreated"></a></p>
<h3 id="packager.callmsiprojectcreated(path)-%E2%87%92-promise%3Cvoid%3E"><code>packager.callMsiProjectCreated(path)</code> ⇒ <code>Promise&lt;void&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>path</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+dispatchArtifactCreated"></a></p>
<h3 id="packager.dispatchartifactcreated(event)"><code>packager.dispatchArtifactCreated(event)</code></h3>
<p>Only for sub artifacts (update info), for main artifacts use <code>callArtifactBuildCompleted</code>.</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>event</td>
<td><code><a href="#ArtifactCreated">ArtifactCreated</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+disposeOnBuildFinish"></a></p>
<h3 id="packager.disposeonbuildfinish(disposer)"><code>packager.disposeOnBuildFinish(disposer)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>disposer</td>
<td><code>callback</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+installAppDependencies"></a></p>
<h3 id="packager.installappdependencies(platform%2C-arch)-%E2%87%92-promise%3Cany%3E"><code>packager.installAppDependencies(platform, arch)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>platform</td>
<td><code><a href="#Platform">Platform</a></code></td>
</tr>
<tr>
<td>arch</td>
<td><code><a href="#Arch">Arch</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Packager+getNodeDependencyInfo"></a></p>
<h3 id="packager.getnodedependencyinfo(platform)-%E2%87%92-lazy%3Carray%3Cmodule%3Aapp-builder-lib%2Fout%2Futil%2Fpackagedependencies.nodemoduledirinfo%3E%3E"><code>packager.getNodeDependencyInfo(platform)</code> ⇒ <code>Lazy&lt;Array&lt;module:app-builder-lib/out/util/packageDependencies.NodeModuleDirInfo&gt;&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>platform</td>
<td><code><a href="#Platform">Platform</a></code> | <code>“undefined”</code></td>
</tr>
</tbody>
</table>
<p><a name="Platform"></a></p>
<h2 id="platform">Platform</h2>
<p><strong>Kind</strong>: class of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><code id="Platform-MAC">MAC</code> = <code>new Platform(&quot;mac&quot;, &quot;mac&quot;, &quot;darwin&quot;)</code> <a href="#Platform">Platform</a></li>
<li><code id="Platform-LINUX">LINUX</code> = <code>new Platform(&quot;linux&quot;, &quot;linux&quot;, &quot;linux&quot;)</code> <a href="#Platform">Platform</a></li>
<li><code id="Platform-WINDOWS">WINDOWS</code> = <code>new Platform(&quot;windows&quot;, &quot;win&quot;, &quot;win32&quot;)</code> <a href="#Platform">Platform</a></li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#Platform">.Platform</a>
<ul>
<li><a href="#module_app-builder-lib.Platform+createTarget"><code>.createTarget(type, archs)</code></a> ⇒ <code>Map&lt;<a href="#Platform">Platform</a> | Map&lt;<a href="#Arch">Arch</a> | Array&lt;String&gt;&gt;&gt;</code></li>
<li><a href="#module_app-builder-lib.Platform+current"><code>.current()</code></a> ⇒ <code><a href="#Platform">Platform</a></code></li>
<li><a href="#module_app-builder-lib.Platform+fromString"><code>.fromString(name)</code></a> ⇒ <code><a href="#Platform">Platform</a></code></li>
<li><a href="#module_app-builder-lib.Platform+toString"><code>.toString()</code></a> ⇒ <code>String</code></li>
</ul>
</li>
</ul>
<p><a name="module_app-builder-lib.Platform+createTarget"></a></p>
<h3 id="platform.createtarget(type%2C-archs)-%E2%87%92-map%3Cplatform-%7C-map%3Carch-%7C-array%3Cstring%3E%3E%3E"><code>platform.createTarget(type, archs)</code> ⇒ <code>Map&lt;<a href="#Platform">Platform</a> | Map&lt;<a href="#Arch">Arch</a> | Array&lt;String&gt;&gt;&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>type</td>
<td><code>String</code> | <code>Array&lt;String&gt;</code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>archs</td>
<td><code>Array&lt;<a href="#Arch">Arch</a>&gt;</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Platform+current"></a></p>
<h3 id="platform.current()-%E2%87%92-platform"><code>platform.current()</code> ⇒ <code><a href="#Platform">Platform</a></code></h3>
<p><a name="module_app-builder-lib.Platform+fromString"></a></p>
<h3 id="platform.fromstring(name)-%E2%87%92-platform"><code>platform.fromString(name)</code> ⇒ <code><a href="#Platform">Platform</a></code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>name</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Platform+toString"></a></p>
<h3 id="platform.tostring()-%E2%87%92-string"><code>platform.toString()</code> ⇒ <code>String</code></h3>
<p><a name="PlatformPackager"></a></p>
<h2 id="platformpackager">PlatformPackager</h2>
<p><strong>Kind</strong>: class of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="PlatformPackager-packagerOptions">packagerOptions</code></strong> <a href="#PackagerOptions">PackagerOptions</a></li>
<li><strong><code id="PlatformPackager-buildResourcesDir">buildResourcesDir</code></strong> String</li>
<li><strong><code id="PlatformPackager-projectDir">projectDir</code></strong> String</li>
<li><strong><code id="PlatformPackager-config">config</code></strong> <a href="#Configuration">Configuration</a></li>
<li><code id="PlatformPackager-platformSpecificBuildOptions">platformSpecificBuildOptions</code> module:app-builder-lib/out/platformPackager.DC</li>
<li><strong><code id="PlatformPackager-resourceList">resourceList</code></strong> Promise&lt;Array&lt;String&gt;&gt;</li>
<li><code id="PlatformPackager-appInfo">appInfo</code> <a href="#AppInfo">AppInfo</a></li>
<li><strong><code id="PlatformPackager-compression">compression</code></strong> “store” | “normal” | “maximum”</li>
<li><strong><code id="PlatformPackager-debugLogger">debugLogger</code></strong> DebugLogger</li>
<li><strong><code id="PlatformPackager-defaultTarget">defaultTarget</code></strong> Array&lt;String&gt;</li>
<li><strong><code id="PlatformPackager-fileAssociations">fileAssociations</code></strong> Array&lt;<a href="#FileAssociation">FileAssociation</a>&gt;</li>
<li><strong><code id="PlatformPackager-forceCodeSigning">forceCodeSigning</code></strong> Boolean</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#PlatformPackager">.PlatformPackager</a>
<ul>
<li><a href="#module_app-builder-lib.PlatformPackager+artifactPatternConfig"><code>.artifactPatternConfig(targetSpecificOptions, defaultPattern)</code></a> ⇒ <code>module:app-builder-lib/out/platformPackager.__object</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+computeSafeArtifactName"><code>.computeSafeArtifactName(suggestedName, ext, arch, skipDefaultArch, defaultArch, safePattern)</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+createTargets"><code>.createTargets(targets, mapper)</code></a></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getDefaultFrameworkIcon"><code>.getDefaultFrameworkIcon()</code></a> ⇒ <code>null</code> | <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+dispatchArtifactCreated"><code>.dispatchArtifactCreated(file, target, arch, safeArtifactName)</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getElectronDestinationDir"><code>.getElectronDestinationDir(appOutDir)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getElectronSrcDir"><code>.getElectronSrcDir(dist)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+expandArtifactBeautyNamePattern"><code>.expandArtifactBeautyNamePattern(targetSpecificOptions, ext, arch)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+expandArtifactNamePattern"><code>.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipDefaultArch, defaultArch)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+expandMacro"><code>.expandMacro(pattern, arch, extra, isProductNameSanitized)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+generateName2"><code>.generateName2(ext, classifier, deployment)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getIconPath"><code>.getIconPath()</code></a> ⇒ <code>Promise&lt; | String&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getMacOsResourcesDir"><code>.getMacOsResourcesDir(appOutDir)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+pack"><code>.pack(outDir, arch, targets, taskManager)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+resolveIcon"><code>.resolveIcon(sources, fallbackSources, outputFormat)</code></a> ⇒ <code>Promise&lt;Array&lt;module:app-builder-lib/out/platformPackager.IconInfo&gt;&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getResource"><code>.getResource(custom, names)</code></a> ⇒ <code>Promise&lt; | String&gt;</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getResourcesDir"><code>.getResourcesDir(appOutDir)</code></a> ⇒ <code>String</code></li>
<li><a href="#module_app-builder-lib.PlatformPackager+getTempFile"><code>.getTempFile(suffix)</code></a> ⇒ <code>Promise&lt;String&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="module_app-builder-lib.PlatformPackager+artifactPatternConfig"></a></p>
<h3 id="platformpackager.artifactpatternconfig(targetspecificoptions%2C-defaultpattern)-%E2%87%92-module%3Aapp-builder-lib%2Fout%2Fplatformpackager.__object"><code>platformPackager.artifactPatternConfig(targetSpecificOptions, defaultPattern)</code> ⇒ <code>module:app-builder-lib/out/platformPackager.__object</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>targetSpecificOptions</td>
<td><code><a href="#TargetSpecificOptions">TargetSpecificOptions</a></code> | <code>“undefined”</code> | <code>undefined</code></td>
</tr>
<tr>
<td>defaultPattern</td>
<td><code>String</code> | <code>undefined</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+computeSafeArtifactName"></a></p>
<h3 id="platformpackager.computesafeartifactname(suggestedname%2C-ext%2C-arch%2C-skipdefaultarch%2C-defaultarch%2C-safepattern)-%E2%87%92-null-%7C-string"><code>platformPackager.computeSafeArtifactName(suggestedName, ext, arch, skipDefaultArch, defaultArch, safePattern)</code> ⇒ <code>null</code> | <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>suggestedName</td>
<td><code>String</code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>ext</td>
<td><code>String</code></td>
</tr>
<tr>
<td>arch</td>
<td><code><a href="#Arch">Arch</a></code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>skipDefaultArch</td>
<td></td>
</tr>
<tr>
<td>defaultArch</td>
<td><code>String</code></td>
</tr>
<tr>
<td>safePattern</td>
<td></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+createTargets"></a></p>
<h3 id="platformpackager.createtargets(targets%2C-mapper)"><code>platformPackager.createTargets(targets, mapper)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>targets</td>
<td><code>Array&lt;String&gt;</code></td>
</tr>
<tr>
<td>mapper</td>
<td><code>callback</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+getDefaultFrameworkIcon"></a></p>
<h3 id="platformpackager.getdefaultframeworkicon()-%E2%87%92-null-%7C-string"><code>platformPackager.getDefaultFrameworkIcon()</code> ⇒ <code>null</code> | <code>String</code></h3>
<p><a name="module_app-builder-lib.PlatformPackager+dispatchArtifactCreated"></a></p>
<h3 id="platformpackager.dispatchartifactcreated(file%2C-target%2C-arch%2C-safeartifactname)-%E2%87%92-promise%3Cvoid%3E"><code>platformPackager.dispatchArtifactCreated(file, target, arch, safeArtifactName)</code> ⇒ <code>Promise&lt;void&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>file</td>
<td><code>String</code></td>
</tr>
<tr>
<td>target</td>
<td><code><a href="#Target">Target</a></code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>arch</td>
<td><code><a href="#Arch">Arch</a></code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>safeArtifactName</td>
<td><code>String</code> | <code>“undefined”</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+getElectronDestinationDir"></a></p>
<h3 id="platformpackager.getelectrondestinationdir(appoutdir)-%E2%87%92-string"><code>platformPackager.getElectronDestinationDir(appOutDir)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>appOutDir</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+getElectronSrcDir"></a></p>
<h3 id="platformpackager.getelectronsrcdir(dist)-%E2%87%92-string"><code>platformPackager.getElectronSrcDir(dist)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>dist</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+expandArtifactBeautyNamePattern"></a></p>
<h3 id="platformpackager.expandartifactbeautynamepattern(targetspecificoptions%2C-ext%2C-arch)-%E2%87%92-string"><code>platformPackager.expandArtifactBeautyNamePattern(targetSpecificOptions, ext, arch)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>targetSpecificOptions</td>
<td><code><a href="#TargetSpecificOptions">TargetSpecificOptions</a></code> | <code>“undefined”</code> | <code>undefined</code></td>
</tr>
<tr>
<td>ext</td>
<td><code>String</code></td>
</tr>
<tr>
<td>arch</td>
<td><code><a href="#Arch">Arch</a></code> | <code>“undefined”</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+expandArtifactNamePattern"></a></p>
<h3 id="platformpackager.expandartifactnamepattern(targetspecificoptions%2C-ext%2C-arch%2C-defaultpattern%2C-skipdefaultarch%2C-defaultarch)-%E2%87%92-string"><code>platformPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern, skipDefaultArch, defaultArch)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>targetSpecificOptions</td>
<td><code><a href="#TargetSpecificOptions">TargetSpecificOptions</a></code> | <code>“undefined”</code> | <code>undefined</code></td>
</tr>
<tr>
<td>ext</td>
<td><code>String</code></td>
</tr>
<tr>
<td>arch</td>
<td><code><a href="#Arch">Arch</a></code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>defaultPattern</td>
<td><code>String</code></td>
</tr>
<tr>
<td>skipDefaultArch</td>
<td></td>
</tr>
<tr>
<td>defaultArch</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+expandMacro"></a></p>
<h3 id="platformpackager.expandmacro(pattern%2C-arch%2C-extra%2C-isproductnamesanitized)-%E2%87%92-string"><code>platformPackager.expandMacro(pattern, arch, extra, isProductNameSanitized)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>pattern</td>
<td><code>String</code></td>
</tr>
<tr>
<td>arch</td>
<td><code>String</code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>extra</td>
<td><code>any</code></td>
</tr>
<tr>
<td>isProductNameSanitized</td>
<td></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+generateName2"></a></p>
<h3 id="platformpackager.generatename2(ext%2C-classifier%2C-deployment)-%E2%87%92-string"><code>platformPackager.generateName2(ext, classifier, deployment)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>ext</td>
<td><code>String</code> | <code>“undefined”</code></td>
</tr>
<tr>
<td>classifier</td>
<td><code>String</code> | <code>“undefined”</code> | <code>undefined</code></td>
</tr>
<tr>
<td>deployment</td>
<td><code>Boolean</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+getIconPath"></a></p>
<h3 id="platformpackager.geticonpath()-%E2%87%92-promise%3C-%7C-string%3E"><code>platformPackager.getIconPath()</code> ⇒ <code>Promise&lt; | String&gt;</code></h3>
<p><a name="module_app-builder-lib.PlatformPackager+getMacOsResourcesDir"></a></p>
<h3 id="platformpackager.getmacosresourcesdir(appoutdir)-%E2%87%92-string"><code>platformPackager.getMacOsResourcesDir(appOutDir)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>appOutDir</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+pack"></a></p>
<h3 id="platformpackager.pack(outdir%2C-arch%2C-targets%2C-taskmanager)-%E2%87%92-promise%3Cany%3E"><code>platformPackager.pack(outDir, arch, targets, taskManager)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>outDir</td>
<td><code>String</code></td>
</tr>
<tr>
<td>arch</td>
<td><code><a href="#Arch">Arch</a></code></td>
</tr>
<tr>
<td>targets</td>
<td><code>Array&lt;<a href="#Target">Target</a>&gt;</code></td>
</tr>
<tr>
<td>taskManager</td>
<td><code>AsyncTaskManager</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+resolveIcon"></a></p>
<h3 id="platformpackager.resolveicon(sources%2C-fallbacksources%2C-outputformat)-%E2%87%92-promise%3Carray%3Cmodule%3Aapp-builder-lib%2Fout%2Fplatformpackager.iconinfo%3E%3E"><code>platformPackager.resolveIcon(sources, fallbackSources, outputFormat)</code> ⇒ <code>Promise&lt;Array&lt;module:app-builder-lib/out/platformPackager.IconInfo&gt;&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>sources</td>
<td><code>Array&lt;String&gt;</code></td>
</tr>
<tr>
<td>fallbackSources</td>
<td><code>Array&lt;String&gt;</code></td>
</tr>
<tr>
<td>outputFormat</td>
<td><code>“icns”</code> | <code>“ico”</code> | <code>“set”</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+getResource"></a></p>
<h3 id="platformpackager.getresource(custom%2C-names)-%E2%87%92-promise%3C-%7C-string%3E"><code>platformPackager.getResource(custom, names)</code> ⇒ <code>Promise&lt; | String&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>custom</td>
<td><code>String</code> | <code>“undefined”</code> | <code>undefined</code></td>
</tr>
<tr>
<td>names</td>
<td><code>Array&lt;String&gt;</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+getResourcesDir"></a></p>
<h3 id="platformpackager.getresourcesdir(appoutdir)-%E2%87%92-string"><code>platformPackager.getResourcesDir(appOutDir)</code> ⇒ <code>String</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>appOutDir</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.PlatformPackager+getTempFile"></a></p>
<h3 id="platformpackager.gettempfile(suffix)-%E2%87%92-promise%3Cstring%3E"><code>platformPackager.getTempFile(suffix)</code> ⇒ <code>Promise&lt;String&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>suffix</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="PublishManager"></a></p>
<h2 id="publishmanager-%E2%87%90-module%3Apackages%2Felectron-publish%2Fout%2Fpublisher.publishcontext">PublishManager ⇐ <code>module:packages/electron-publish/out/publisher.PublishContext</code></h2>
<p><strong>Kind</strong>: class of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Extends</strong>: <code>module:packages/electron-publish/out/publisher.PublishContext</code><br>
<strong>Properties</strong></p>
<ul>
<li><code id="PublishManager-isPublish">isPublish</code> = <code>false</code> Boolean</li>
<li><code id="PublishManager-progress">progress</code> = <code>(process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null</code> MultiProgress</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#PublishManager">.PublishManager</a> ⇐ <code>module:packages/electron-publish/out/publisher.PublishContext</code>
<ul>
<li><a href="#module_app-builder-lib.PublishManager+awaitTasks"><code>.awaitTasks()</code></a> ⇒ <code>Promise&lt;void&gt;</code></li>
<li><a href="#module_app-builder-lib.PublishManager+cancelTasks"><code>.cancelTasks()</code></a></li>
<li><a href="#module_app-builder-lib.PublishManager+getGlobalPublishConfigurations"><code>.getGlobalPublishConfigurations()</code></a> ⇒ <code>Promise&lt; | Array&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="module_app-builder-lib.PublishManager+awaitTasks"></a></p>
<h3 id="publishmanager.awaittasks()-%E2%87%92-promise%3Cvoid%3E"><code>publishManager.awaitTasks()</code> ⇒ <code>Promise&lt;void&gt;</code></h3>
<p><a name="module_app-builder-lib.PublishManager+cancelTasks"></a></p>
<h3 id="publishmanager.canceltasks()"><code>publishManager.cancelTasks()</code></h3>
<p><a name="module_app-builder-lib.PublishManager+getGlobalPublishConfigurations"></a></p>
<h3 id="publishmanager.getglobalpublishconfigurations()-%E2%87%92-promise%3C-%7C-array%3E"><code>publishManager.getGlobalPublishConfigurations()</code> ⇒ <code>Promise&lt; | Array&gt;</code></h3>
<p><a name="Target"></a></p>
<h2 id="target">Target</h2>
<p><strong>Kind</strong>: class of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><code id="Target-outDir">outDir</code> String</li>
<li><code id="Target-options">options</code> <a href="#TargetSpecificOptions">TargetSpecificOptions</a> | “undefined” | undefined</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#Target">.Target</a>
<ul>
<li><a href="#module_app-builder-lib.Target+build"><code>.build(appOutDir, arch)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_app-builder-lib.Target+finishBuild"><code>.finishBuild()</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="module_app-builder-lib.Target+build"></a></p>
<h3 id="target.build(appoutdir%2C-arch)-%E2%87%92-promise%3Cany%3E"><code>target.build(appOutDir, arch)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>appOutDir</td>
<td><code>String</code></td>
</tr>
<tr>
<td>arch</td>
<td><code><a href="#Arch">Arch</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.Target+finishBuild"></a></p>
<h3 id="target.finishbuild()-%E2%87%92-promise%3Cany%3E"><code>target.finishBuild()</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<p><a name="module_app-builder-lib.build"></a></p>
<h2 id="app-builder-lib.build(options%2C-packager)-%E2%87%92-promise%3Carray%3Cstring%3E%3E"><code>app-builder-lib.build(options, packager)</code> ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code></h2>
<p><strong>Kind</strong>: method of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/></p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>options</td>
<td><code><a href="#PackagerOptions">PackagerOptions</a></code> | <code>module:packages/electron-publish/out/publisher.PublishOptions</code></td>
</tr>
<tr>
<td>packager</td>
<td><code><a href="#Packager">Packager</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_app-builder-lib.buildForge"></a></p>
<h2 id="app-builder-lib.buildforge(forgeoptions%2C-options)-%E2%87%92-promise%3Carray%3Cstring%3E%3E"><code>app-builder-lib.buildForge(forgeOptions, options)</code> ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code></h2>
<p><strong>Kind</strong>: method of <a href="#module_app-builder-lib"><code>app-builder-lib</code></a><br/></p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>forgeOptions</td>
<td><code><a href="#ForgeOptions">ForgeOptions</a></code></td>
</tr>
<tr>
<td>options</td>
<td><code><a href="#PackagerOptions">PackagerOptions</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-publish"></a></p>
<h1 id="electron-publish">electron-publish</h1>
<ul>
<li><a href="#module_electron-publish">electron-publish</a>
<ul>
<li><a href="#PublishContext"><code>.PublishContext</code></a></li>
<li><a href="#UploadTask"><code>.UploadTask</code></a></li>
<li><a href="#HttpPublisher">.HttpPublisher</a> ⇐ <code><a href="#Publisher">Publisher</a></code>
<ul>
<li><a href="#module_electron-publish.HttpPublisher+upload"><code>.upload(task)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_electron-publish.Publisher+toString"><code>.toString()</code></a> ⇒ <code>String</code></li>
</ul>
</li>
<li><a href="#ProgressCallback">.ProgressCallback</a>
<ul>
<li><a href="#module_electron-publish.ProgressCallback+update"><code>.update(transferred, total)</code></a></li>
</ul>
</li>
<li><a href="#Publisher">.Publisher</a>
<ul>
<li><a href="#module_electron-publish.Publisher+toString"><code>.toString()</code></a> ⇒ <code>String</code></li>
<li><a href="#module_electron-publish.Publisher+upload"><code>.upload(task)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
</ul>
</li>
<li><a href="#module_electron-publish.getCiTag"><code>.getCiTag()</code></a> ⇒ <code>null</code> | <code>String</code></li>
</ul>
</li>
</ul>
<p><a name="PublishContext"></a></p>
<h2 id="publishcontext"><code>PublishContext</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_electron-publish"><code>electron-publish</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="PublishContext-cancellationToken">cancellationToken</code></strong> CancellationToken</li>
<li><strong><code id="PublishContext-progress">progress</code></strong> module:electron-publish/out/multiProgress.MultiProgress | “undefined”</li>
</ul>
<p><a name="UploadTask"></a></p>
<h2 id="uploadtask"><code>UploadTask</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_electron-publish"><code>electron-publish</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="UploadTask-file">file</code></strong> String</li>
<li><code id="UploadTask-fileContent">fileContent</code> module:global.Buffer | “undefined”</li>
<li><strong><code id="UploadTask-arch">arch</code></strong> <a href="#Arch">Arch</a> | “undefined”</li>
<li><code id="UploadTask-safeArtifactName">safeArtifactName</code> String | “undefined”</li>
</ul>
<p><a name="HttpPublisher"></a></p>
<h2 id="httppublisher-%E2%87%90-publisher">HttpPublisher ⇐ <code><a href="#Publisher">Publisher</a></code></h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-publish"><code>electron-publish</code></a><br/>
<strong>Extends</strong>: <code><a href="#Publisher">Publisher</a></code></p>
<ul>
<li><a href="#HttpPublisher">.HttpPublisher</a> ⇐ <code><a href="#Publisher">Publisher</a></code>
<ul>
<li><a href="#module_electron-publish.HttpPublisher+upload"><code>.upload(task)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_electron-publish.Publisher+toString"><code>.toString()</code></a> ⇒ <code>String</code></li>
</ul>
</li>
</ul>
<p><a name="module_electron-publish.HttpPublisher+upload"></a></p>
<h3 id="httppublisher.upload(task)-%E2%87%92-promise%3Cany%3E"><code>httpPublisher.upload(task)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<p><strong>Overrides</strong>: <a href="#module_electron-publish.Publisher+upload"><code>upload</code></a></p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>task</td>
<td><code><a href="#UploadTask">UploadTask</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-publish.Publisher+toString"></a></p>
<h3 id="httppublisher.tostring()-%E2%87%92-string"><code>httpPublisher.toString()</code> ⇒ <code>String</code></h3>
<p><a name="ProgressCallback"></a></p>
<h2 id="progresscallback">ProgressCallback</h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-publish"><code>electron-publish</code></a><br/>
<a name="module_electron-publish.ProgressCallback+update"></a></p>
<h3 id="progresscallback.update(transferred%2C-total)"><code>progressCallback.update(transferred, total)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>transferred</td>
<td><code>Number</code></td>
</tr>
<tr>
<td>total</td>
<td><code>Number</code></td>
</tr>
</tbody>
</table>
<p><a name="Publisher"></a></p>
<h2 id="publisher">Publisher</h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-publish"><code>electron-publish</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="Publisher-providerName">providerName</code></strong> String</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#Publisher">.Publisher</a>
<ul>
<li><a href="#module_electron-publish.Publisher+toString"><code>.toString()</code></a> ⇒ <code>String</code></li>
<li><a href="#module_electron-publish.Publisher+upload"><code>.upload(task)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="module_electron-publish.Publisher+toString"></a></p>
<h3 id="publisher.tostring()-%E2%87%92-string"><code>publisher.toString()</code> ⇒ <code>String</code></h3>
<p><a name="module_electron-publish.Publisher+upload"></a></p>
<h3 id="publisher.upload(task)-%E2%87%92-promise%3Cany%3E"><code>publisher.upload(task)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>task</td>
<td><code><a href="#UploadTask">UploadTask</a></code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-publish.getCiTag"></a></p>
<h2 id="electron-publish.getcitag()-%E2%87%92-null-%7C-string"><code>electron-publish.getCiTag()</code> ⇒ <code>null</code> | <code>String</code></h2>
<p><strong>Kind</strong>: method of <a href="#module_electron-publish"><code>electron-publish</code></a><br/>
<a name="module_electron-updater"></a></p>
<h1 id="electron-updater">electron-updater</h1>
<ul>
<li><a href="#module_electron-updater">electron-updater</a>
<ul>
<li><a href="#Logger"><code>.Logger</code></a>
<ul>
<li><a href="#module_electron-updater.Logger+debug"><code>.debug(message)</code></a></li>
<li><a href="#module_electron-updater.Logger+error"><code>.error(message)</code></a></li>
<li><a href="#module_electron-updater.Logger+info"><code>.info(message)</code></a></li>
<li><a href="#module_electron-updater.Logger+warn"><code>.warn(message)</code></a></li>
</ul>
</li>
<li><a href="#ResolvedUpdateFileInfo"><code>.ResolvedUpdateFileInfo</code></a></li>
<li><a href="#UpdateCheckResult"><code>.UpdateCheckResult</code></a></li>
<li><a href="#UpdateDownloadedEvent"><code>.UpdateDownloadedEvent</code></a> ⇐ <code>module:builder-util-runtime.UpdateInfo</code></li>
<li><a href="#AppImageUpdater">.AppImageUpdater</a> ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code>
<ul>
<li><a href="#module_electron-updater.AppImageUpdater+isUpdaterActive"><code>.isUpdaterActive()</code></a> ⇒ <code>Boolean</code></li>
</ul>
</li>
<li><a href="#AppUpdater">.AppUpdater</a> ⇐ <code>module:events.EventEmitter</code>
<ul>
<li><a href="#module_electron-updater.AppUpdater+addAuthHeader"><code>.addAuthHeader(token)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdates"><code>.checkForUpdates()</code></a> ⇒ <code>Promise&lt;<a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdatesAndNotify"><code>.checkForUpdatesAndNotify(downloadNotification)</code></a> ⇒ <code>Promise&lt; | <a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+downloadUpdate"><code>.downloadUpdate(cancellationToken)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+getFeedURL"><code>.getFeedURL()</code></a> ⇒ <code>undefined</code> | <code>null</code> | <code>String</code></li>
<li><a href="#module_electron-updater.AppUpdater+setFeedURL"><code>.setFeedURL(options)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+isUpdaterActive"><code>.isUpdaterActive()</code></a> ⇒ <code>Boolean</code></li>
<li><a href="#module_electron-updater.AppUpdater+quitAndInstall"><code>.quitAndInstall(isSilent, isForceRunAfter)</code></a></li>
</ul>
</li>
<li><a href="#MacUpdater">.MacUpdater</a> ⇐ <code><a href="#AppUpdater">AppUpdater</a></code>
<ul>
<li><a href="#module_electron-updater.MacUpdater+quitAndInstall"><code>.quitAndInstall()</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+addAuthHeader"><code>.addAuthHeader(token)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdates"><code>.checkForUpdates()</code></a> ⇒ <code>Promise&lt;<a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdatesAndNotify"><code>.checkForUpdatesAndNotify(downloadNotification)</code></a> ⇒ <code>Promise&lt; | <a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+downloadUpdate"><code>.downloadUpdate(cancellationToken)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+getFeedURL"><code>.getFeedURL()</code></a> ⇒ <code>undefined</code> | <code>null</code> | <code>String</code></li>
<li><a href="#module_electron-updater.AppUpdater+setFeedURL"><code>.setFeedURL(options)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+isUpdaterActive"><code>.isUpdaterActive()</code></a> ⇒ <code>Boolean</code></li>
</ul>
</li>
<li><a href="#NsisUpdater">.NsisUpdater</a> ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code></li>
<li><a href="#Provider">.Provider</a>
<ul>
<li><a href="#module_electron-updater.Provider+getLatestVersion"><code>.getLatestVersion()</code></a> ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code></li>
<li><a href="#module_electron-updater.Provider+setRequestHeaders"><code>.setRequestHeaders(value)</code></a></li>
<li><a href="#module_electron-updater.Provider+resolveFiles"><code>.resolveFiles(updateInfo)</code></a> ⇒ <code>Array&lt;<a href="#ResolvedUpdateFileInfo">ResolvedUpdateFileInfo</a>&gt;</code></li>
</ul>
</li>
<li><a href="#UpdaterSignal">.UpdaterSignal</a>
<ul>
<li><a href="#module_electron-updater.UpdaterSignal+login"><code>.login(handler)</code></a></li>
<li><a href="#module_electron-updater.UpdaterSignal+progress"><code>.progress(handler)</code></a></li>
<li><a href="#module_electron-updater.UpdaterSignal+updateCancelled"><code>.updateCancelled(handler)</code></a></li>
<li><a href="#module_electron-updater.UpdaterSignal+updateDownloaded"><code>.updateDownloaded(handler)</code></a></li>
</ul>
</li>
<li><a href="#module_electron-updater.autoUpdater"><code>.autoUpdater</code></a> : <code><a href="#AppUpdater">AppUpdater</a></code></li>
<li><a href="#module_electron-updater.DOWNLOAD_PROGRESS"><code>.DOWNLOAD_PROGRESS</code></a> : <code>“login”</code> | <code>“checking-for-update”</code> | <code>“update-available”</code> | <code>“update-not-available”</code> | <code>“update-cancelled”</code> | <code>“download-progress”</code> | <code>“update-downloaded”</code> | <code>“error”</code></li>
<li><a href="#module_electron-updater.UPDATE_DOWNLOADED"><code>.UPDATE_DOWNLOADED</code></a> : <code>“login”</code> | <code>“checking-for-update”</code> | <code>“update-available”</code> | <code>“update-not-available”</code> | <code>“update-cancelled”</code> | <code>“download-progress”</code> | <code>“update-downloaded”</code> | <code>“error”</code></li>
</ul>
</li>
</ul>
<p><a name="Logger"></a></p>
<h2 id="logger"><code>Logger</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_electron-updater"><code>electron-updater</code></a><br/></p>
<ul>
<li><a href="#Logger"><code>.Logger</code></a>
<ul>
<li><a href="#module_electron-updater.Logger+debug"><code>.debug(message)</code></a></li>
<li><a href="#module_electron-updater.Logger+error"><code>.error(message)</code></a></li>
<li><a href="#module_electron-updater.Logger+info"><code>.info(message)</code></a></li>
<li><a href="#module_electron-updater.Logger+warn"><code>.warn(message)</code></a></li>
</ul>
</li>
</ul>
<p><a name="module_electron-updater.Logger+debug"></a></p>
<h3 id="logger.debug(message)"><code>logger.debug(message)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>message</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.Logger+error"></a></p>
<h3 id="logger.error(message)"><code>logger.error(message)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>message</td>
<td><code>any</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.Logger+info"></a></p>
<h3 id="logger.info(message)"><code>logger.info(message)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>message</td>
<td><code>any</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.Logger+warn"></a></p>
<h3 id="logger.warn(message)"><code>logger.warn(message)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>message</td>
<td><code>any</code></td>
</tr>
</tbody>
</table>
<p><a name="ResolvedUpdateFileInfo"></a></p>
<h2 id="resolvedupdatefileinfo"><code>ResolvedUpdateFileInfo</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="ResolvedUpdateFileInfo-url">url</code></strong> module:url.URL</li>
<li><strong><code id="ResolvedUpdateFileInfo-info">info</code></strong> module:builder-util-runtime.UpdateFileInfo</li>
<li><code id="ResolvedUpdateFileInfo-packageInfo">packageInfo</code> module:builder-util-runtime.PackageFileInfo</li>
</ul>
<p><a name="UpdateCheckResult"></a></p>
<h2 id="updatecheckresult"><code>UpdateCheckResult</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="UpdateCheckResult-updateInfo">updateInfo</code></strong> module:builder-util-runtime.UpdateInfo</li>
<li><code id="UpdateCheckResult-downloadPromise">downloadPromise</code> Promise&lt;Array&lt;String&gt;&gt; | “undefined”</li>
<li><code id="UpdateCheckResult-cancellationToken">cancellationToken</code> CancellationToken</li>
<li tag.description=""><strong><code id="UpdateCheckResult-versionInfo">versionInfo</code></strong> module:builder-util-runtime.UpdateInfo - Deprecated:</li>
</ul>
<p><a name="UpdateDownloadedEvent"></a></p>
<h2 id="updatedownloadedevent-%E2%87%90-module%3Abuilder-util-runtime.updateinfo"><code>UpdateDownloadedEvent</code> ⇐ <code>module:builder-util-runtime.UpdateInfo</code></h2>
<p><strong>Kind</strong>: interface of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Extends</strong>: <code>module:builder-util-runtime.UpdateInfo</code><br>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="UpdateDownloadedEvent-downloadedFile">downloadedFile</code></strong> String</li>
</ul>
<p><a name="AppImageUpdater"></a></p>
<h2 id="appimageupdater-%E2%87%90-module%3Aelectron-updater%2Fout%2Fbaseupdater.baseupdater">AppImageUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code></h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Extends</strong>: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code><br>
<a name="module_electron-updater.AppImageUpdater+isUpdaterActive"></a></p>
<h3 id="appimageupdater.isupdateractive()-%E2%87%92-boolean"><code>appImageUpdater.isUpdaterActive()</code> ⇒ <code>Boolean</code></h3>
<p><a name="AppUpdater"></a></p>
<h2 id="appupdater-%E2%87%90-module%3Aevents.eventemitter">AppUpdater ⇐ <code>module:events.EventEmitter</code></h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Extends</strong>: <code>module:events.EventEmitter</code><br>
<strong>Properties</strong></p>
<ul>
<li>
<p><code id="AppUpdater-autoDownload">autoDownload</code> = <code>true</code> Boolean - Whether to automatically download an update when it is found.</p>
</li>
<li>
<p><code id="AppUpdater-autoInstallOnAppQuit">autoInstallOnAppQuit</code> = <code>true</code> Boolean - Whether to automatically install a downloaded update on app quit (if <code>quitAndInstall</code> was not called before).</p>
</li>
<li>
<p><code id="AppUpdater-allowPrerelease">allowPrerelease</code> = <code>false</code> Boolean - <em>GitHub provider only.</em> Whether to allow update to pre-release versions. Defaults to <code>true</code> if application version contains prerelease components (e.g. <code>0.12.1-alpha.1</code>, here <code>alpha</code> is a prerelease component), otherwise <code>false</code>.</p>
<p>If <code>true</code>, downgrade will be allowed (<code>allowDowngrade</code> will be set to <code>true</code>).</p>
</li>
<li>
<p><code id="AppUpdater-fullChangelog">fullChangelog</code> = <code>false</code> Boolean - <em>GitHub provider only.</em> Get all release notes (from current version to latest), not just the latest.</p>
</li>
<li>
<p><code id="AppUpdater-allowDowngrade">allowDowngrade</code> = <code>false</code> Boolean - Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).</p>
<p>Taken in account only if channel differs (pre-release version component in terms of semantic versioning).</p>
</li>
<li>
<p><code id="AppUpdater-currentVersion">currentVersion</code> SemVer - The current application version.</p>
</li>
<li>
<p><strong><code id="AppUpdater-channel">channel</code></strong> String | “undefined” - Get the update channel. Not applicable for GitHub. Doesn’t return <code>channel</code> from the update configuration, only if was previously set.</p>
</li>
<li>
<p><strong><code id="AppUpdater-requestHeaders">requestHeaders</code></strong> [key: string]: string | “undefined” - The request headers.</p>
</li>
<li>
<p><strong><code id="AppUpdater-netSession">netSession</code></strong> Electron:Session</p>
</li>
<li>
<p><strong><code id="AppUpdater-logger">logger</code></strong> <a href="#Logger">Logger</a> | “undefined” - The logger. You can pass <a href="https://github.com/megahertz/electron-log">electron-log</a>, <a href="https://github.com/winstonjs/winston">winston</a> or another logger with the following interface: <code>{ info(), warn(), error() }</code>. Set it to <code>null</code> if you would like to disable a logging feature.</p>
</li>
<li>
<p><code id="AppUpdater-signals">signals</code> = <code>new UpdaterSignal(this)</code> <a href="#UpdaterSignal">UpdaterSignal</a></p>
</li>
<li>
<p><code id="AppUpdater-configOnDisk">configOnDisk</code> = <code>new Lazy&lt;any&gt;(() =&gt; this.loadUpdateConfig())</code> Lazy&lt;any&gt;</p>
</li>
<li>
<p><code id="AppUpdater-httpExecutor">httpExecutor</code> module:electron-updater/out/electronHttpExecutor.ElectronHttpExecutor</p>
</li>
<li>
<p><strong><code id="AppUpdater-isAddNoCacheQuery">isAddNoCacheQuery</code></strong> Boolean</p>
</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#AppUpdater">.AppUpdater</a> ⇐ <code>module:events.EventEmitter</code>
<ul>
<li><a href="#module_electron-updater.AppUpdater+addAuthHeader"><code>.addAuthHeader(token)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdates"><code>.checkForUpdates()</code></a> ⇒ <code>Promise&lt;<a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdatesAndNotify"><code>.checkForUpdatesAndNotify(downloadNotification)</code></a> ⇒ <code>Promise&lt; | <a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+downloadUpdate"><code>.downloadUpdate(cancellationToken)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+getFeedURL"><code>.getFeedURL()</code></a> ⇒ <code>undefined</code> | <code>null</code> | <code>String</code></li>
<li><a href="#module_electron-updater.AppUpdater+setFeedURL"><code>.setFeedURL(options)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+isUpdaterActive"><code>.isUpdaterActive()</code></a> ⇒ <code>Boolean</code></li>
<li><a href="#module_electron-updater.AppUpdater+quitAndInstall"><code>.quitAndInstall(isSilent, isForceRunAfter)</code></a></li>
</ul>
</li>
</ul>
<p><a name="module_electron-updater.AppUpdater+addAuthHeader"></a></p>
<h3 id="appupdater.addauthheader(token)"><code>appUpdater.addAuthHeader(token)</code></h3>
<p>Shortcut for explicitly adding auth tokens to request headers</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>token</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+checkForUpdates"></a></p>
<h3 id="appupdater.checkforupdates()-%E2%87%92-promise%3Cupdatecheckresult%3E"><code>appUpdater.checkForUpdates()</code> ⇒ <code>Promise&lt;<a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></h3>
<p>Asks the server whether there is an update.</p>
<p><a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a></p>
<h3 id="appupdater.checkforupdatesandnotify(downloadnotification)-%E2%87%92-promise%3C-%7C-updatecheckresult%3E"><code>appUpdater.checkForUpdatesAndNotify(downloadNotification)</code> ⇒ <code>Promise&lt; | <a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>downloadNotification</td>
<td><code>module:electron-updater/out/AppUpdater.DownloadNotification</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+downloadUpdate"></a></p>
<h3 id="appupdater.downloadupdate(cancellationtoken)-%E2%87%92-promise%3Cany%3E"><code>appUpdater.downloadUpdate(cancellationToken)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<p>Start downloading update manually. You can use this method if <code>autoDownload</code> option is set to <code>false</code>.</p>
<p><strong>Returns</strong>: <code>Promise&lt;any&gt;</code> - Path to downloaded file.</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>cancellationToken</td>
<td><code>CancellationToken</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+getFeedURL"></a></p>
<h3 id="appupdater.getfeedurl()-%E2%87%92-undefined-%7C-null-%7C-string"><code>appUpdater.getFeedURL()</code> ⇒ <code>undefined</code> | <code>null</code> | <code>String</code></h3>
<p><a name="module_electron-updater.AppUpdater+setFeedURL"></a></p>
<h3 id="appupdater.setfeedurl(options)"><code>appUpdater.setFeedURL(options)</code></h3>
<p>Configure update provider. If value is <code>string</code>, <a href="/configuration/publish#genericserveroptions">GenericServerOptions</a> will be set with value as <code>url</code>.</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td>options</td>
<td><code><a href="/configuration/publish#publishconfiguration">PublishConfiguration</a></code> | <code>String</code> | <code><a href="/configuration/publish#githuboptions">GithubOptions</a></code> | <code><a href="/configuration/publish#s3options">S3Options</a></code> | <code><a href="/configuration/publish#spacesoptions">SpacesOptions</a></code> | <code><a href="/configuration/publish#genericserveroptions">GenericServerOptions</a></code> | <code><a href="/configuration/publish#bintrayoptions">BintrayOptions</a></code> | <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> | <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> | <code><a href="/configuration/publish#snapstoreoptions">SnapStoreOptions</a></code> | <code>module:builder-util-runtime/out/publishOptions.BitbucketOptions</code> | <code>String</code></td>
<td>If you want to override configuration in the <code>app-update.yml</code>.</td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+isUpdaterActive"></a></p>
<h3 id="appupdater.isupdateractive()-%E2%87%92-boolean"><code>appUpdater.isUpdaterActive()</code> ⇒ <code>Boolean</code></h3>
<p><a name="module_electron-updater.AppUpdater+quitAndInstall"></a></p>
<h3 id="appupdater.quitandinstall(issilent%2C-isforcerunafter)"><code>appUpdater.quitAndInstall(isSilent, isForceRunAfter)</code></h3>
<p>Restarts the app and installs the update after it has been downloaded.
It should only be called after <code>update-downloaded</code> has been emitted.</p>
<p><strong>Note:</strong> <code>autoUpdater.quitAndInstall()</code> will close all application windows first and only emit <code>before-quit</code> event on <code>app</code> after that.
This is different from the normal quit event sequence.</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td>isSilent</td>
<td><code>Boolean</code></td>
<td><em>windows-only</em> Runs the installer in silent mode. Defaults to <code>false</code>.</td>
</tr>
<tr>
<td>isForceRunAfter</td>
<td><code>Boolean</code></td>
<td>Run the app after finish even on silent install. Not applicable for macOS. Ignored if <code>isSilent</code> is set to <code>false</code>.</td>
</tr>
</tbody>
</table>
<p><a name="MacUpdater"></a></p>
<h2 id="macupdater-%E2%87%90-appupdater">MacUpdater ⇐ <code><a href="#AppUpdater">AppUpdater</a></code></h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Extends</strong>: <code><a href="#AppUpdater">AppUpdater</a></code></p>
<ul>
<li><a href="#MacUpdater">.MacUpdater</a> ⇐ <code><a href="#AppUpdater">AppUpdater</a></code>
<ul>
<li><a href="#module_electron-updater.MacUpdater+quitAndInstall"><code>.quitAndInstall()</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+addAuthHeader"><code>.addAuthHeader(token)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdates"><code>.checkForUpdates()</code></a> ⇒ <code>Promise&lt;<a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+checkForUpdatesAndNotify"><code>.checkForUpdatesAndNotify(downloadNotification)</code></a> ⇒ <code>Promise&lt; | <a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+downloadUpdate"><code>.downloadUpdate(cancellationToken)</code></a> ⇒ <code>Promise&lt;any&gt;</code></li>
<li><a href="#module_electron-updater.AppUpdater+getFeedURL"><code>.getFeedURL()</code></a> ⇒ <code>undefined</code> | <code>null</code> | <code>String</code></li>
<li><a href="#module_electron-updater.AppUpdater+setFeedURL"><code>.setFeedURL(options)</code></a></li>
<li><a href="#module_electron-updater.AppUpdater+isUpdaterActive"><code>.isUpdaterActive()</code></a> ⇒ <code>Boolean</code></li>
</ul>
</li>
</ul>
<p><a name="module_electron-updater.MacUpdater+quitAndInstall"></a></p>
<h3 id="macupdater.quitandinstall()"><code>macUpdater.quitAndInstall()</code></h3>
<p><strong>Overrides</strong>: <a href="#module_electron-updater.AppUpdater+quitAndInstall"><code>quitAndInstall</code></a><br>
<a name="module_electron-updater.AppUpdater+addAuthHeader"></a></p>
<h3 id="macupdater.addauthheader(token)"><code>macUpdater.addAuthHeader(token)</code></h3>
<p>Shortcut for explicitly adding auth tokens to request headers</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>token</td>
<td><code>String</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+checkForUpdates"></a></p>
<h3 id="macupdater.checkforupdates()-%E2%87%92-promise%3Cupdatecheckresult%3E"><code>macUpdater.checkForUpdates()</code> ⇒ <code>Promise&lt;<a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></h3>
<p>Asks the server whether there is an update.</p>
<p><a name="module_electron-updater.AppUpdater+checkForUpdatesAndNotify"></a></p>
<h3 id="macupdater.checkforupdatesandnotify(downloadnotification)-%E2%87%92-promise%3C-%7C-updatecheckresult%3E"><code>macUpdater.checkForUpdatesAndNotify(downloadNotification)</code> ⇒ <code>Promise&lt; | <a href="#UpdateCheckResult">UpdateCheckResult</a>&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>downloadNotification</td>
<td><code>module:electron-updater/out/AppUpdater.DownloadNotification</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+downloadUpdate"></a></p>
<h3 id="macupdater.downloadupdate(cancellationtoken)-%E2%87%92-promise%3Cany%3E"><code>macUpdater.downloadUpdate(cancellationToken)</code> ⇒ <code>Promise&lt;any&gt;</code></h3>
<p>Start downloading update manually. You can use this method if <code>autoDownload</code> option is set to <code>false</code>.</p>
<p><strong>Returns</strong>: <code>Promise&lt;any&gt;</code> - Path to downloaded file.</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>cancellationToken</td>
<td><code>CancellationToken</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+getFeedURL"></a></p>
<h3 id="macupdater.getfeedurl()-%E2%87%92-undefined-%7C-null-%7C-string"><code>macUpdater.getFeedURL()</code> ⇒ <code>undefined</code> | <code>null</code> | <code>String</code></h3>
<p><a name="module_electron-updater.AppUpdater+setFeedURL"></a></p>
<h3 id="macupdater.setfeedurl(options)"><code>macUpdater.setFeedURL(options)</code></h3>
<p>Configure update provider. If value is <code>string</code>, <a href="/configuration/publish#genericserveroptions">GenericServerOptions</a> will be set with value as <code>url</code>.</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td>options</td>
<td><code><a href="/configuration/publish#publishconfiguration">PublishConfiguration</a></code> | <code>String</code> | <code><a href="/configuration/publish#githuboptions">GithubOptions</a></code> | <code><a href="/configuration/publish#s3options">S3Options</a></code> | <code><a href="/configuration/publish#spacesoptions">SpacesOptions</a></code> | <code><a href="/configuration/publish#genericserveroptions">GenericServerOptions</a></code> | <code><a href="/configuration/publish#bintrayoptions">BintrayOptions</a></code> | <code>module:builder-util-runtime/out/publishOptions.CustomPublishOptions</code> | <code>module:builder-util-runtime/out/publishOptions.KeygenOptions</code> | <code><a href="/configuration/publish#snapstoreoptions">SnapStoreOptions</a></code> | <code>module:builder-util-runtime/out/publishOptions.BitbucketOptions</code> | <code>String</code></td>
<td>If you want to override configuration in the <code>app-update.yml</code>.</td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.AppUpdater+isUpdaterActive"></a></p>
<h3 id="macupdater.isupdateractive()-%E2%87%92-boolean"><code>macUpdater.isUpdaterActive()</code> ⇒ <code>Boolean</code></h3>
<p><a name="NsisUpdater"></a></p>
<h2 id="nsisupdater-%E2%87%90-module%3Aelectron-updater%2Fout%2Fbaseupdater.baseupdater">NsisUpdater ⇐ <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code></h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Extends</strong>: <code>module:electron-updater/out/BaseUpdater.BaseUpdater</code><br>
<a name="Provider"></a></p>
<h2 id="provider">Provider</h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<strong>Properties</strong></p>
<ul>
<li><strong><code id="Provider-isUseMultipleRangeRequest">isUseMultipleRangeRequest</code></strong> Boolean</li>
<li><strong><code id="Provider-fileExtraDownloadHeaders">fileExtraDownloadHeaders</code></strong> [key: string]: string | “undefined”</li>
</ul>
<p><strong>Methods</strong></p>
<ul>
<li><a href="#Provider">.Provider</a>
<ul>
<li><a href="#module_electron-updater.Provider+getLatestVersion"><code>.getLatestVersion()</code></a> ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code></li>
<li><a href="#module_electron-updater.Provider+setRequestHeaders"><code>.setRequestHeaders(value)</code></a></li>
<li><a href="#module_electron-updater.Provider+resolveFiles"><code>.resolveFiles(updateInfo)</code></a> ⇒ <code>Array&lt;<a href="#ResolvedUpdateFileInfo">ResolvedUpdateFileInfo</a>&gt;</code></li>
</ul>
</li>
</ul>
<p><a name="module_electron-updater.Provider+getLatestVersion"></a></p>
<h3 id="provider.getlatestversion()-%E2%87%92-promise%3Cmodule%3Aelectron-updater%2Fout%2Fproviders%2Fprovider.t%3E"><code>provider.getLatestVersion()</code> ⇒ <code>Promise&lt;module:electron-updater/out/providers/Provider.T&gt;</code></h3>
<p><a name="module_electron-updater.Provider+setRequestHeaders"></a></p>
<h3 id="provider.setrequestheaders(value)"><code>provider.setRequestHeaders(value)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>value</td>
<td><code>[key: string]: string</code> | <code>“undefined”</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.Provider+resolveFiles"></a></p>
<h3 id="provider.resolvefiles(updateinfo)-%E2%87%92-array%3Cresolvedupdatefileinfo%3E"><code>provider.resolveFiles(updateInfo)</code> ⇒ <code>Array&lt;<a href="#ResolvedUpdateFileInfo">ResolvedUpdateFileInfo</a>&gt;</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>updateInfo</td>
<td><code>module:electron-updater/out/providers/Provider.T</code></td>
</tr>
</tbody>
</table>
<p><a name="UpdaterSignal"></a></p>
<h2 id="updatersignal">UpdaterSignal</h2>
<p><strong>Kind</strong>: class of <a href="#module_electron-updater"><code>electron-updater</code></a><br/></p>
<ul>
<li><a href="#UpdaterSignal">.UpdaterSignal</a>
<ul>
<li><a href="#module_electron-updater.UpdaterSignal+login"><code>.login(handler)</code></a></li>
<li><a href="#module_electron-updater.UpdaterSignal+progress"><code>.progress(handler)</code></a></li>
<li><a href="#module_electron-updater.UpdaterSignal+updateCancelled"><code>.updateCancelled(handler)</code></a></li>
<li><a href="#module_electron-updater.UpdaterSignal+updateDownloaded"><code>.updateDownloaded(handler)</code></a></li>
</ul>
</li>
</ul>
<p><a name="module_electron-updater.UpdaterSignal+login"></a></p>
<h3 id="updatersignal.login(handler)"><code>updaterSignal.login(handler)</code></h3>
<p>Emitted when an authenticating proxy is <a href="https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login">asking for user credentials</a>.</p>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>handler</td>
<td><code>module:electron-updater.__type</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.UpdaterSignal+progress"></a></p>
<h3 id="updatersignal.progress(handler)"><code>updaterSignal.progress(handler)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>handler</td>
<td><code>callback</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.UpdaterSignal+updateCancelled"></a></p>
<h3 id="updatersignal.updatecancelled(handler)"><code>updaterSignal.updateCancelled(handler)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>handler</td>
<td><code>callback</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.UpdaterSignal+updateDownloaded"></a></p>
<h3 id="updatersignal.updatedownloaded(handler)"><code>updaterSignal.updateDownloaded(handler)</code></h3>
<table>
<thead>
<tr>
<th>Param</th>
<th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>handler</td>
<td><code>callback</code></td>
</tr>
</tbody>
</table>
<p><a name="module_electron-updater.autoUpdater"></a></p>
<h2 id="electron-updater.autoupdater-%3A-appupdater"><code>electron-updater.autoUpdater</code> : <code><a href="#AppUpdater">AppUpdater</a></code></h2>
<p><strong>Kind</strong>: constant of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<a name="module_electron-updater.DOWNLOAD_PROGRESS"></a></p>
<h2 id="electron-updater.download_progress-%3A-%E2%80%9Clogin%E2%80%9D-%7C-%E2%80%9Cchecking-for-update%E2%80%9D-%7C-%E2%80%9Cupdate-available%E2%80%9D-%7C-%E2%80%9Cupdate-not-available%E2%80%9D-%7C-%E2%80%9Cupdate-cancelled%E2%80%9D-%7C-%E2%80%9Cdownload-progress%E2%80%9D-%7C-%E2%80%9Cupdate-downloaded%E2%80%9D-%7C-%E2%80%9Cerror%E2%80%9D"><code>electron-updater.DOWNLOAD_PROGRESS</code> : <code>“login”</code> | <code>“checking-for-update”</code> | <code>“update-available”</code> | <code>“update-not-available”</code> | <code>“update-cancelled”</code> | <code>“download-progress”</code> | <code>“update-downloaded”</code> | <code>“error”</code></h2>
<p><strong>Kind</strong>: constant of <a href="#module_electron-updater"><code>electron-updater</code></a><br/>
<a name="module_electron-updater.UPDATE_DOWNLOADED"></a></p>
<h2 id="electron-updater.update_downloaded-%3A-%E2%80%9Clogin%E2%80%9D-%7C-%E2%80%9Cchecking-for-update%E2%80%9D-%7C-%E2%80%9Cupdate-available%E2%80%9D-%7C-%E2%80%9Cupdate-not-available%E2%80%9D-%7C-%E2%80%9Cupdate-cancelled%E2%80%9D-%7C-%E2%80%9Cdownload-progress%E2%80%9D-%7C-%E2%80%9Cupdate-downloaded%E2%80%9D-%7C-%E2%80%9Cerror%E2%80%9D"><code>electron-updater.UPDATE_DOWNLOADED</code> : <code>“login”</code> | <code>“checking-for-update”</code> | <code>“update-available”</code> | <code>“update-not-available”</code> | <code>“update-cancelled”</code> | <code>“download-progress”</code> | <code>“update-downloaded”</code> | <code>“error”</code></h2>
<p><strong>Kind</strong>: constant of <a href="#module_electron-updater"><code>electron-updater</code></a><br/></p>

<!-- end of generated block -->
