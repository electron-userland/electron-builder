## Modules

* [electron-builder/out/appInfo](#module_electron-builder/out/appInfo)
    * [.AppInfo](#module_electron-builder/out/appInfo.AppInfo)
        * [`.computePackageUrl()`](#module_electron-builder/out/appInfo.AppInfo+computePackageUrl) ⇒ <code>Promise</code>
* [electron-builder/out/asar](#module_electron-builder/out/asar)
    * [.AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)
        * [`.getFile(p, followLinks)`](#module_electron-builder/out/asar.AsarFilesystem+getFile) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
        * [`.insertDirectory(p, unpacked)`](#module_electron-builder/out/asar.AsarFilesystem+insertDirectory) ⇒ <code>module:electron-builder/out/asar.__type</code>
        * [`.insertFileNode(node, stat, file)`](#module_electron-builder/out/asar.AsarFilesystem+insertFileNode)
        * [`.getNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getNode) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
        * [`.getOrCreateNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getOrCreateNode) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
        * [`.readFile(file)`](#module_electron-builder/out/asar.AsarFilesystem+readFile) ⇒ <code>Promise</code>
        * [`.readJson(file)`](#module_electron-builder/out/asar.AsarFilesystem+readJson) ⇒ <code>Promise</code>
        * [`.searchNodeFromDirectory(p)`](#module_electron-builder/out/asar.AsarFilesystem+searchNodeFromDirectory) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
    * [.Node](#module_electron-builder/out/asar.Node)
    * [`.readAsar(archive)`](#module_electron-builder/out/asar.readAsar) ⇒ <code>Promise</code>
    * [`.readAsarJson(archive, file)`](#module_electron-builder/out/asar.readAsarJson) ⇒ <code>Promise</code>
* [electron-builder/out/asarUtil](#module_electron-builder/out/asarUtil)
    * [`.checkFileInArchive(asarFile, relativeFile, messagePrefix)`](#module_electron-builder/out/asarUtil.checkFileInArchive) ⇒ <code>Promise</code>
    * [`.createAsarArchive(src, resourcesPath, options, filter, unpackPattern)`](#module_electron-builder/out/asarUtil.createAsarArchive) ⇒ <code>Promise</code>
* [electron-builder/out/builder](#module_electron-builder/out/builder)
    * [`.normalizeOptions(args)`](#module_electron-builder/out/builder.normalizeOptions) ⇒ <code>module:electron-builder/out/builder.BuildOptions</code>
* [electron-builder/out/cli/cliOptions](#module_electron-builder/out/cli/cliOptions)
    * [`.createYargs()`](#module_electron-builder/out/cli/cliOptions.createYargs) ⇒ <code>any</code>
* [electron-builder/out/codeSign](#module_electron-builder/out/codeSign)
    * [`.CodeSigningInfo`](#module_electron-builder/out/codeSign.CodeSigningInfo)
    * [`.findIdentityRawResult`](#module_electron-builder/out/codeSign.findIdentityRawResult) : <code>Promise</code> &#124; <code>null</code>
    * [`.createKeychain(tmpDir, cscLink, cscKeyPassword, cscILink, cscIKeyPassword)`](#module_electron-builder/out/codeSign.createKeychain) ⇒ <code>Promise</code>
    * [`.downloadCertificate(urlOrBase64, tmpDir)`](#module_electron-builder/out/codeSign.downloadCertificate) ⇒ <code>Promise</code>
    * [`.findIdentity(certType, qualifier, keychain)`](#module_electron-builder/out/codeSign.findIdentity) ⇒ <code>Promise</code>
    * [`.sign(path, name, keychain)`](#module_electron-builder/out/codeSign.sign) ⇒ <code>Promise</code>
* [electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)
    * [.FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)
        * [`.addAllPattern()`](#module_electron-builder/out/fileMatcher.FileMatcher+addAllPattern)
        * [`.addPattern(pattern)`](#module_electron-builder/out/fileMatcher.FileMatcher+addPattern)
        * [`.computeParsedPatterns(result, fromDir)`](#module_electron-builder/out/fileMatcher.FileMatcher+computeParsedPatterns)
        * [`.containsOnlyIgnore()`](#module_electron-builder/out/fileMatcher.FileMatcher+containsOnlyIgnore) ⇒ <code>boolean</code>
        * [`.createFilter(ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/fileMatcher.FileMatcher+createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
        * [`.isEmpty()`](#module_electron-builder/out/fileMatcher.FileMatcher+isEmpty) ⇒ <code>boolean</code>
    * [`.copyFiles(patterns)`](#module_electron-builder/out/fileMatcher.copyFiles) ⇒ <code>Promise</code>
* [electron-builder/out/linuxPackager](#module_electron-builder/out/linuxPackager)
    * [.LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/linuxPackager.LinuxPackager+createTargets)
        * [`.postInitApp(appOutDir)`](#module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp) ⇒ <code>Promise</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
* [electron-builder/out/macPackager](#module_electron-builder/out/macPackager)
    * [.MacPackager](#module_electron-builder/out/macPackager.MacPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/macPackager.MacPackager+createTargets)
        * [`.getIconPath()`](#module_electron-builder/out/macPackager.MacPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/macPackager.MacPackager+pack) ⇒ <code>Promise</code>
        * [`.doFlat(appPath, outFile, identity, keychain)`](#module_electron-builder/out/macPackager.MacPackager+doFlat) ⇒ <code>Promise</code>
        * [`.doSign(opts)`](#module_electron-builder/out/macPackager.MacPackager+doSign) ⇒ <code>Promise</code>
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/macPackager.MacPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise</code>
* [electron-builder/out/packager/dirPackager](#module_electron-builder/out/packager/dirPackager)
    * [`.unpackElectron(packager, out, platform, arch, electronVersion)`](#module_electron-builder/out/packager/dirPackager.unpackElectron) ⇒ <code>Promise</code>
* [electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)
    * [`.createApp(packager, appOutDir)`](#module_electron-builder/out/packager/mac.createApp) ⇒ <code>Promise</code>
    * [`.filterCFBundleIdentifier(identifier)`](#module_electron-builder/out/packager/mac.filterCFBundleIdentifier) ⇒ <code>string</code>
* [electron-builder/out/packager](#module_electron-builder/out/packager)
    * [`.normalizePlatforms(rawPlatforms)`](#module_electron-builder/out/packager.normalizePlatforms) ⇒ <code>Array</code>
* [electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)
    * [.PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise</code>
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
    * [`.normalizeExt(ext)`](#module_electron-builder/out/platformPackager.normalizeExt) ⇒ <code>string</code>
* [electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)
    * [.PublishManager](#module_electron-builder/out/publish/PublishManager.PublishManager) ⇐ <code>module:electron-publish.PublishContext</code>
        * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise</code>
        * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)
        * [`.getOrCreatePublisher(publishConfig, buildInfo)`](#module_electron-builder/out/publish/PublishManager.PublishManager+getOrCreatePublisher) ⇒
    * [`.computeDownloadUrl(publishConfig, fileName, packager, arch)`](#module_electron-builder/out/publish/PublishManager.computeDownloadUrl) ⇒ <code>string</code>
    * [`.createPublisher(context, version, publishConfig, options)`](#module_electron-builder/out/publish/PublishManager.createPublisher) ⇒
    * [`.getPublishConfigs(packager, targetSpecificOptions)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigs) ⇒ <code>Promise</code>
    * [`.getPublishConfigsForUpdateInfo(packager, publishConfigs)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo) ⇒ <code>Promise</code>
* [electron-builder/out/publish/publisher](#module_electron-builder/out/publish/publisher)
    * [`.getCiTag()`](#module_electron-builder/out/publish/publisher.getCiTag) ⇒ <code>any</code>
    * [`.getResolvedPublishConfig(packager, publishConfig, errorIfCannot)`](#module_electron-builder/out/publish/publisher.getResolvedPublishConfig) ⇒ <code>Promise</code>
* [electron-builder/out/readInstalled](#module_electron-builder/out/readInstalled)
    * [`.Dependency`](#module_electron-builder/out/readInstalled.Dependency)
    * [`.readInstalled(folder)`](#module_electron-builder/out/readInstalled.readInstalled) ⇒ <code>Promise</code>
* [electron-builder/out/repositoryInfo](#module_electron-builder/out/repositoryInfo)
    * [`.RepositorySlug`](#module_electron-builder/out/repositoryInfo.RepositorySlug)
    * [`.getRepositoryInfo(projectDir, metadata, devMetadata)`](#module_electron-builder/out/repositoryInfo.getRepositoryInfo) ⇒ <code>Promise</code>
* [electron-builder/out/targets/ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget)
    * [.ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
* [electron-builder/out/targets/LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper)
    * [.LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper)
        * [`.computeDesktopEntry(platformSpecificBuildOptions, exec, destination, extra)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+computeDesktopEntry) ⇒ <code>Promise</code>
        * [`.getDescription(options)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription) ⇒ <code>string</code>
* [electron-builder/out/targets/WebInstaller](#module_electron-builder/out/targets/WebInstaller)
    * [.WebInstallerTarget](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget) ⇐ <code>module:electron-builder/out/targets/nsis.default</code>
        * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+configureDefines) ⇒ <code>Promise</code>
        * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+generateGitHubInstallerName) ⇒ <code>string</code>
* [electron-builder/out/targets/appImage](#module_electron-builder/out/targets/appImage)
    * [.AppImageTarget](#module_electron-builder/out/targets/appImage.AppImageTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appImage.AppImageTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
* [electron-builder/out/targets/appx](#module_electron-builder/out/targets/appx)
    * [.AppXTarget](#module_electron-builder/out/targets/appx.AppXTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appx.AppXTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
* [electron-builder/out/targets/archive](#module_electron-builder/out/targets/archive)
    * [`.archive(compression, format, outFile, dirToArchive, withoutDir)`](#module_electron-builder/out/targets/archive.archive) ⇒ <code>Promise</code>
    * [`.tar(compression, format, outFile, dirToArchive, isMacApp)`](#module_electron-builder/out/targets/archive.tar) ⇒ <code>Promise</code>
* [electron-builder/out/targets/dmg](#module_electron-builder/out/targets/dmg)
    * [.DmgTarget](#module_electron-builder/out/targets/dmg.DmgTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appPath, arch)`](#module_electron-builder/out/targets/dmg.DmgTarget+build) ⇒ <code>Promise</code>
        * [`.computeDmgOptions()`](#module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions) ⇒ <code>Promise</code>
        * [`.computeVolumeName(custom)`](#module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName) ⇒ <code>string</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.attachAndExecute(dmgPath, readWrite, task)`](#module_electron-builder/out/targets/dmg.attachAndExecute) ⇒ <code>Promise</code>
* [electron-builder/out/targets/fpm](#module_electron-builder/out/targets/fpm)
    * [.FpmTarget](#module_electron-builder/out/targets/fpm.FpmTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/fpm.FpmTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
* [electron-builder/out/targets/nsis](#module_electron-builder/out/targets/nsis)
    * [.NsisTarget](#module_electron-builder/out/targets/nsis.NsisTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise</code>
        * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/nsis.NsisTarget+configureDefines) ⇒ <code>Promise</code>
        * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName) ⇒ <code>string</code>
* [electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)
    * [.PkgTarget](#module_electron-builder/out/targets/pkg.PkgTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appPath, arch)`](#module_electron-builder/out/targets/pkg.PkgTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.prepareProductBuildArgs(identity, keychain)`](#module_electron-builder/out/targets/pkg.prepareProductBuildArgs) ⇒ <code>Array</code>
* [electron-builder/out/targets/snap](#module_electron-builder/out/targets/snap)
    * [.SnapTarget](#module_electron-builder/out/targets/snap.SnapTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/snap.SnapTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
* [electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)
    * [.NoOpTarget](#module_electron-builder/out/targets/targetFactory.NoOpTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/targetFactory.NoOpTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.computeArchToTargetNamesMap(raw, options, platform)`](#module_electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap) ⇒ <code>Map</code>
    * [`.createCommonTarget(target, outDir, packager)`](#module_electron-builder/out/targets/targetFactory.createCommonTarget) ⇒ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.createTargets(nameToTarget, rawList, outDir, packager, cleanupTasks)`](#module_electron-builder/out/targets/targetFactory.createTargets) ⇒ <code>Array</code>
* [electron-builder/out/util/filter](#module_electron-builder/out/util/filter)
    * [`.createFilter(src, patterns, ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/util/filter.createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
    * [`.hasMagic(pattern)`](#module_electron-builder/out/util/filter.hasMagic) ⇒ <code>boolean</code>
* [electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)
    * [`.doLoadConfig(configFile, projectDir)`](#module_electron-builder/out/util/readPackageJson.doLoadConfig) ⇒ <code>Promise</code>
    * [`.getElectronVersion(config, projectDir, projectMetadata)`](#module_electron-builder/out/util/readPackageJson.getElectronVersion) ⇒ <code>Promise</code>
    * [`.loadConfig(projectDir)`](#module_electron-builder/out/util/readPackageJson.loadConfig) ⇒ <code>Promise</code>
    * [`.readPackageJson(file)`](#module_electron-builder/out/util/readPackageJson.readPackageJson) ⇒ <code>Promise</code>
    * [`.validateConfig(config)`](#module_electron-builder/out/util/readPackageJson.validateConfig) ⇒ <code>Promise</code>
* [electron-builder/out/winPackager](#module_electron-builder/out/winPackager)
    * [.WinPackager](#module_electron-builder/out/winPackager.WinPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/winPackager.WinPackager+createTargets)
        * [`.getIconPath()`](#module_electron-builder/out/winPackager.WinPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.sign(file, logMessagePrefix)`](#module_electron-builder/out/winPackager.WinPackager+sign) ⇒ <code>Promise</code>
        * [`.signAndEditResources(file)`](#module_electron-builder/out/winPackager.WinPackager+signAndEditResources) ⇒ <code>Promise</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/winPackager.WinPackager+doGetCscPassword) ⇒ <code>string</code>
        * [`.doSign(options)`](#module_electron-builder/out/winPackager.WinPackager+doSign) ⇒ <code>Promise</code>
        * [`.postInitApp(appOutDir)`](#module_electron-builder/out/winPackager.WinPackager+postInitApp) ⇒ <code>Promise</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
* [electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)
    * [`.FileCodeSigningInfo`](#module_electron-builder/out/windowsCodeSign.FileCodeSigningInfo)
    * [`.SignOptions`](#module_electron-builder/out/windowsCodeSign.SignOptions)
    * [`.getSignVendorPath()`](#module_electron-builder/out/windowsCodeSign.getSignVendorPath) ⇒ <code>Promise</code>
    * [`.getToolPath()`](#module_electron-builder/out/windowsCodeSign.getToolPath) ⇒ <code>Promise</code>
    * [`.sign(options)`](#module_electron-builder/out/windowsCodeSign.sign) ⇒ <code>Promise</code>
* [electron-builder/out/yarn](#module_electron-builder/out/yarn)
    * [`.getGypEnv(electronVersion, platform, arch, buildFromSource)`](#module_electron-builder/out/yarn.getGypEnv) ⇒ <code>any</code>
    * [`.installOrRebuild(config, appDir, electronVersion, platform, arch, forceInstall)`](#module_electron-builder/out/yarn.installOrRebuild) ⇒ <code>Promise</code>
    * [`.rebuild(appDir, electronVersion, platform, arch, additionalArgs, buildFromSource)`](#module_electron-builder/out/yarn.rebuild) ⇒ <code>Promise</code>
* [electron-builder-core](#module_electron-builder-core)
    * [`.AsarOptions`](#module_electron-builder-core.AsarOptions)
    * [`.AuthorMetadata`](#module_electron-builder-core.AuthorMetadata)
    * [`.BeforeBuildContext`](#module_electron-builder-core.BeforeBuildContext)
    * [`.FilePattern`](#module_electron-builder-core.FilePattern)
    * [`.RepositoryInfo`](#module_electron-builder-core.RepositoryInfo)
    * [`.TargetConfig`](#module_electron-builder-core.TargetConfig)
    * [`.TargetSpecificOptions`](#module_electron-builder-core.TargetSpecificOptions)
    * [.Platform](#module_electron-builder-core.Platform)
        * [`.createTarget(type, archs)`](#module_electron-builder-core.Platform+createTarget) ⇒ <code>Map</code>
        * [`.current()`](#module_electron-builder-core.Platform+current) ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
        * [`.fromString(name)`](#module_electron-builder-core.Platform+fromString) ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
        * [`.toString()`](#module_electron-builder-core.Platform+toString) ⇒ <code>string</code>
    * [.Target](#module_electron-builder-core.Target)
        * [`.build(appOutDir, arch)`](#module_electron-builder-core.Target+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.archFromString(name)`](#module_electron-builder-core.archFromString) ⇒ <code>module:electron-builder-core.Arch</code>
    * [`.getArchSuffix(arch)`](#module_electron-builder-core.getArchSuffix) ⇒ <code>string</code>
    * [`.toLinuxArchString(arch)`](#module_electron-builder-core.toLinuxArchString) ⇒
* [electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)
    * [.CancellationError](#module_electron-builder-http/out/CancellationToken.CancellationError) ⇐ <code>Error</code>
    * [.CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken) ⇐ <code>internal:EventEmitter</code>
        * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
        * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise</code>
        * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)
* [electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)
    * [`.ProgressInfo`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo)
    * [.ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)
* [electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)
    * [`.File`](#module_electron-builder-http/out/bintray.File)
    * [`.Version`](#module_electron-builder-http/out/bintray.Version)
    * [.BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)
        * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise</code>
        * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise</code>
        * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise</code>
        * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise</code>
    * [`.bintrayRequest(path, auth, data, cancellationToken, method)`](#module_electron-builder-http/out/bintray.bintrayRequest) ⇒ <code>Promise</code>
* [electron-builder-http](#module_electron-builder-http)
    * [`.DownloadOptions`](#module_electron-builder-http.DownloadOptions)
        * [`.onProgress(progress)`](#module_electron-builder-http.DownloadOptions+onProgress)
    * [`.RequestHeaders`](#module_electron-builder-http.RequestHeaders)
    * [`.Response`](#module_electron-builder-http.Response) ⇐ <code>internal:EventEmitter</code>
        * [`.setEncoding(encoding)`](#module_electron-builder-http.Response+setEncoding)
    * [.HttpError](#module_electron-builder-http.HttpError) ⇐ <code>Error</code>
    * [.HttpExecutor](#module_electron-builder-http.HttpExecutor)
        * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
    * [.HttpExecutorHolder](#module_electron-builder-http.HttpExecutorHolder)
    * [`.configureRequestOptions(options, token, method)`](#module_electron-builder-http.configureRequestOptions) ⇒ <code>module:http.RequestOptions</code>
    * [`.download(url, destination, options)`](#module_electron-builder-http.download) ⇒ <code>Promise</code>
    * [`.dumpRequestOptions(options)`](#module_electron-builder-http.dumpRequestOptions) ⇒ <code>string</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.request) ⇒ <code>Promise</code>
* [electron-publish/out/BintrayPublisher](#module_electron-publish/out/BintrayPublisher)
    * [.BintrayPublisher](#module_electron-publish/out/BintrayPublisher.BintrayPublisher) ⇐ <code>module:electron-publish.HttpPublisher</code>
        * [`.deleteRelease()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease) ⇒ <code>Promise</code>
        * [`.toString()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString) ⇒ <code>string</code>
        * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+doUpload) ⇒ <code>Promise</code>
* [electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)
    * [`.Release`](#module_electron-publish/out/gitHubPublisher.Release)
    * [.GitHubPublisher](#module_electron-publish/out/gitHubPublisher.GitHubPublisher) ⇐ <code>module:electron-publish.HttpPublisher</code>
        * [`.deleteRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease) ⇒ <code>Promise</code>
        * [`.getRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease) ⇒ <code>Promise</code>
        * [`.toString()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString) ⇒ <code>string</code>
        * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+doUpload) ⇒ <code>Promise</code>
* [electron-publish/out/multiProgress](#module_electron-publish/out/multiProgress)
    * [.MultiProgress](#module_electron-publish/out/multiProgress.MultiProgress)
        * [`.createBar(format, options)`](#module_electron-publish/out/multiProgress.MultiProgress+createBar) ⇒ <code>any</code>
        * [`.terminate()`](#module_electron-publish/out/multiProgress.MultiProgress+terminate)
* [electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)
    * [.BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise</code>
* [electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)
    * [.GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise</code>
    * [`.validateUpdateInfo(info)`](#module_electron-updater/out/GenericProvider.validateUpdateInfo)
* [electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)
    * [.GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise</code>
* [electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)
    * [.MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater) ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable)
* [electron-updater/out/NsisUpdater](#module_electron-updater/out/NsisUpdater)
    * [.NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater) ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate) ⇒ <code>Promise</code>
* [electron-updater/out/electronHttpExecutor](#module_electron-updater/out/electronHttpExecutor)
    * [.ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise</code>
        * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
* [electron-builder-util/out/binDownload](#module_electron-builder-util/out/binDownload)
    * [`.getBin(name, dirName, url, sha2)`](#module_electron-builder-util/out/binDownload.getBin) ⇒ <code>Promise</code>
    * [`.getBinFromBintray(name, version, sha2)`](#module_electron-builder-util/out/binDownload.getBinFromBintray) ⇒ <code>Promise</code>
* [electron-builder-util/out/deepAssign](#module_electron-builder-util/out/deepAssign)
    * [`.deepAssign(target, objects)`](#module_electron-builder-util/out/deepAssign.deepAssign) ⇒ <code>any</code>
* [electron-builder-util/out/fs](#module_electron-builder-util/out/fs)
    * [.FileCopier](#module_electron-builder-util/out/fs.FileCopier)
        * [`.copy(src, dest, stat)`](#module_electron-builder-util/out/fs.FileCopier+copy) ⇒ <code>Promise</code>
    * [`.copyDir(src, destination, filter, isUseHardLink)`](#module_electron-builder-util/out/fs.copyDir) ⇒ <code>Promise</code>
    * [`.copyFile(src, dest, stats, isUseHardLink)`](#module_electron-builder-util/out/fs.copyFile) ⇒ <code>Promise</code>
    * [`.exists(file)`](#module_electron-builder-util/out/fs.exists) ⇒ <code>Promise</code>
    * [`.statOrNull(file)`](#module_electron-builder-util/out/fs.statOrNull) ⇒ <code>Promise</code>
    * [`.unlinkIfExists(file)`](#module_electron-builder-util/out/fs.unlinkIfExists) ⇒ <code>Promise</code>
    * [`.walk(initialDirPath, filter, consumer)`](#module_electron-builder-util/out/fs.walk) ⇒ <code>Promise</code>
* [electron-builder-util/out/log](#module_electron-builder-util/out/log)
    * [`.log(message)`](#module_electron-builder-util/out/log.log)
    * [`.setPrinter(value)`](#module_electron-builder-util/out/log.setPrinter)
    * [`.subTask(title, promise)`](#module_electron-builder-util/out/log.subTask) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.task(title, promise)`](#module_electron-builder-util/out/log.task) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.warn(message)`](#module_electron-builder-util/out/log.warn)
* [electron-builder-util/out/nodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor)
    * [.NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.download(url, destination, options)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+download) ⇒ <code>Promise</code>
        * [`.doRequest(options, callback)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
    * [`.httpExecutor`](#module_electron-builder-util/out/nodeHttpExecutor.httpExecutor) : <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>
* [electron-builder-util/out/promise](#module_electron-builder-util/out/promise)
    * [.NestedError](#module_electron-builder-util/out/promise.NestedError) ⇐ <code>Error</code>
    * [`.all(promises)`](#module_electron-builder-util/out/promise.all) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.executeFinally(promise, task)`](#module_electron-builder-util/out/promise.executeFinally) ⇒ <code>Promise</code>
    * [`.printErrorAndExit(error)`](#module_electron-builder-util/out/promise.printErrorAndExit)
    * [`.throwError(errors)`](#module_electron-builder-util/out/promise.throwError)
* [electron-builder-util/out/tmp](#module_electron-builder-util/out/tmp)
    * [.TmpDir](#module_electron-builder-util/out/tmp.TmpDir)
        * [`.cleanup()`](#module_electron-builder-util/out/tmp.TmpDir+cleanup) ⇒ <code>Promise</code>
        * [`.getTempFile(suffix)`](#module_electron-builder-util/out/tmp.TmpDir+getTempFile) ⇒ <code>Promise</code>
* [electron-builder-util](#module_electron-builder-util)
    * [`.BaseExecOptions`](#module_electron-builder-util.BaseExecOptions)
    * [`.ExecOptions`](#module_electron-builder-util.ExecOptions) ⇐ <code>[BaseExecOptions](#module_electron-builder-util.BaseExecOptions)</code>
    * [.Lazy](#module_electron-builder-util.Lazy)
    * [`.addValue(map, key, value)`](#module_electron-builder-util.addValue)
    * [`.asArray(v)`](#module_electron-builder-util.asArray) ⇒ <code>Array</code>
    * [`.computeDefaultAppDirectory(projectDir, userAppDir)`](#module_electron-builder-util.computeDefaultAppDirectory) ⇒ <code>Promise</code>
    * [`.debug7zArgs(command)`](#module_electron-builder-util.debug7zArgs) ⇒ <code>Array</code>
    * [`.doSpawn(command, args, options, pipeInput)`](#module_electron-builder-util.doSpawn) ⇒ <code>module:child_process.ChildProcess</code>
    * [`.exec(file, args, options)`](#module_electron-builder-util.exec) ⇒ <code>Promise</code>
    * [`.execWine(file, args, options)`](#module_electron-builder-util.execWine) ⇒ <code>Promise</code>
    * [`.getCacheDirectory()`](#module_electron-builder-util.getCacheDirectory) ⇒ <code>string</code>
    * [`.getPlatformIconFileName(value, isMac)`](#module_electron-builder-util.getPlatformIconFileName) ⇒
    * [`.getTempName(prefix)`](#module_electron-builder-util.getTempName) ⇒ <code>string</code>
    * [`.handleProcess(event, childProcess, command, resolve, reject)`](#module_electron-builder-util.handleProcess)
    * [`.isEmptyOrSpaces(s)`](#module_electron-builder-util.isEmptyOrSpaces) ⇒ <code>boolean</code>
    * [`.prepareArgs(args, exePath)`](#module_electron-builder-util.prepareArgs) ⇒ <code>Array</code>
    * [`.removePassword(input)`](#module_electron-builder-util.removePassword) ⇒ <code>string</code>
    * [`.replaceDefault(inList, defaultList)`](#module_electron-builder-util.replaceDefault) ⇒ <code>Array</code>
    * [`.smarten(s)`](#module_electron-builder-util.smarten) ⇒ <code>string</code>
    * [`.spawn(command, args, options)`](#module_electron-builder-util.spawn) ⇒ <code>Promise</code>
    * [`.use(value, task)`](#module_electron-builder-util.use) ⇒

<a name="module_electron-builder/out/appInfo"></a>

## electron-builder/out/appInfo

* [electron-builder/out/appInfo](#module_electron-builder/out/appInfo)
    * [.AppInfo](#module_electron-builder/out/appInfo.AppInfo)
        * [`.computePackageUrl()`](#module_electron-builder/out/appInfo.AppInfo+computePackageUrl) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/appInfo.AppInfo"></a>

### electron-builder/out/appInfo.AppInfo
**Kind**: class of <code>[electron-builder/out/appInfo](#module_electron-builder/out/appInfo)</code>  

-

<a name="module_electron-builder/out/appInfo.AppInfo+computePackageUrl"></a>

#### `appInfo.computePackageUrl()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>  

-

<a name="module_electron-builder/out/asar"></a>

## electron-builder/out/asar

* [electron-builder/out/asar](#module_electron-builder/out/asar)
    * [.AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)
        * [`.getFile(p, followLinks)`](#module_electron-builder/out/asar.AsarFilesystem+getFile) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
        * [`.insertDirectory(p, unpacked)`](#module_electron-builder/out/asar.AsarFilesystem+insertDirectory) ⇒ <code>module:electron-builder/out/asar.__type</code>
        * [`.insertFileNode(node, stat, file)`](#module_electron-builder/out/asar.AsarFilesystem+insertFileNode)
        * [`.getNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getNode) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
        * [`.getOrCreateNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getOrCreateNode) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
        * [`.readFile(file)`](#module_electron-builder/out/asar.AsarFilesystem+readFile) ⇒ <code>Promise</code>
        * [`.readJson(file)`](#module_electron-builder/out/asar.AsarFilesystem+readJson) ⇒ <code>Promise</code>
        * [`.searchNodeFromDirectory(p)`](#module_electron-builder/out/asar.AsarFilesystem+searchNodeFromDirectory) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
    * [.Node](#module_electron-builder/out/asar.Node)
    * [`.readAsar(archive)`](#module_electron-builder/out/asar.readAsar) ⇒ <code>Promise</code>
    * [`.readAsarJson(archive, file)`](#module_electron-builder/out/asar.readAsarJson) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/asar.AsarFilesystem"></a>

### electron-builder/out/asar.AsarFilesystem
**Kind**: class of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  

* [.AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)
    * [`.getFile(p, followLinks)`](#module_electron-builder/out/asar.AsarFilesystem+getFile) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
    * [`.insertDirectory(p, unpacked)`](#module_electron-builder/out/asar.AsarFilesystem+insertDirectory) ⇒ <code>module:electron-builder/out/asar.__type</code>
    * [`.insertFileNode(node, stat, file)`](#module_electron-builder/out/asar.AsarFilesystem+insertFileNode)
    * [`.getNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getNode) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
    * [`.getOrCreateNode(p)`](#module_electron-builder/out/asar.AsarFilesystem+getOrCreateNode) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
    * [`.readFile(file)`](#module_electron-builder/out/asar.AsarFilesystem+readFile) ⇒ <code>Promise</code>
    * [`.readJson(file)`](#module_electron-builder/out/asar.AsarFilesystem+readJson) ⇒ <code>Promise</code>
    * [`.searchNodeFromDirectory(p)`](#module_electron-builder/out/asar.AsarFilesystem+searchNodeFromDirectory) ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>


-

<a name="module_electron-builder/out/asar.AsarFilesystem+getFile"></a>

#### `asarFilesystem.getFile(p, followLinks)` ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 
| followLinks | <code>boolean</code> | 


-

<a name="module_electron-builder/out/asar.AsarFilesystem+insertDirectory"></a>

#### `asarFilesystem.insertDirectory(p, unpacked)` ⇒ <code>module:electron-builder/out/asar.__type</code>
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 
| unpacked | <code>boolean</code> | 


-

<a name="module_electron-builder/out/asar.AsarFilesystem+insertFileNode"></a>

#### `asarFilesystem.insertFileNode(node, stat, file)`
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| node | <code>[Node](#module_electron-builder/out/asar.Node)</code> | 
| stat | <code>module:fs.Stats</code> | 
| file | <code>string</code> | 


-

<a name="module_electron-builder/out/asar.AsarFilesystem+getNode"></a>

#### `asarFilesystem.getNode(p)` ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 


-

<a name="module_electron-builder/out/asar.AsarFilesystem+getOrCreateNode"></a>

#### `asarFilesystem.getOrCreateNode(p)` ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 


-

<a name="module_electron-builder/out/asar.AsarFilesystem+readFile"></a>

#### `asarFilesystem.readFile(file)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 


-

<a name="module_electron-builder/out/asar.AsarFilesystem+readJson"></a>

#### `asarFilesystem.readJson(file)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 


-

<a name="module_electron-builder/out/asar.AsarFilesystem+searchNodeFromDirectory"></a>

#### `asarFilesystem.searchNodeFromDirectory(p)` ⇒ <code>[Node](#module_electron-builder/out/asar.Node)</code>
**Kind**: instance method of <code>[AsarFilesystem](#module_electron-builder/out/asar.AsarFilesystem)</code>  

| Param | Type |
| --- | --- |
| p | <code>string</code> | 


-

<a name="module_electron-builder/out/asar.Node"></a>

### electron-builder/out/asar.Node
**Kind**: class of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  

-

<a name="module_electron-builder/out/asar.readAsar"></a>

### `electron-builder/out/asar.readAsar(archive)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  

| Param | Type |
| --- | --- |
| archive | <code>string</code> | 


-

<a name="module_electron-builder/out/asar.readAsarJson"></a>

### `electron-builder/out/asar.readAsarJson(archive, file)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/asar](#module_electron-builder/out/asar)</code>  

| Param | Type |
| --- | --- |
| archive | <code>string</code> | 
| file | <code>string</code> | 


-

<a name="module_electron-builder/out/asarUtil"></a>

## electron-builder/out/asarUtil

* [electron-builder/out/asarUtil](#module_electron-builder/out/asarUtil)
    * [`.checkFileInArchive(asarFile, relativeFile, messagePrefix)`](#module_electron-builder/out/asarUtil.checkFileInArchive) ⇒ <code>Promise</code>
    * [`.createAsarArchive(src, resourcesPath, options, filter, unpackPattern)`](#module_electron-builder/out/asarUtil.createAsarArchive) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/asarUtil.checkFileInArchive"></a>

### `electron-builder/out/asarUtil.checkFileInArchive(asarFile, relativeFile, messagePrefix)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/asarUtil](#module_electron-builder/out/asarUtil)</code>  

| Param | Type |
| --- | --- |
| asarFile | <code>string</code> | 
| relativeFile | <code>string</code> | 
| messagePrefix | <code>string</code> | 


-

<a name="module_electron-builder/out/asarUtil.createAsarArchive"></a>

### `electron-builder/out/asarUtil.createAsarArchive(src, resourcesPath, options, filter, unpackPattern)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/asarUtil](#module_electron-builder/out/asarUtil)</code>  

| Param | Type |
| --- | --- |
| src | <code>string</code> | 
| resourcesPath | <code>string</code> | 
| options | <code>[AsarOptions](#module_electron-builder-core.AsarOptions)</code> | 
| filter | <code>module:electron-builder-util/out/fs.__type</code> | 
| unpackPattern | <code>module:electron-builder-util/out/fs.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/builder"></a>

## electron-builder/out/builder

-

<a name="module_electron-builder/out/builder.normalizeOptions"></a>

### `electron-builder/out/builder.normalizeOptions(args)` ⇒ <code>module:electron-builder/out/builder.BuildOptions</code>
**Kind**: method of <code>[electron-builder/out/builder](#module_electron-builder/out/builder)</code>  

| Param | Type |
| --- | --- |
| args | <code>module:electron-builder.CliOptions</code> | 


-

<a name="module_electron-builder/out/cli/cliOptions"></a>

## electron-builder/out/cli/cliOptions

-

<a name="module_electron-builder/out/cli/cliOptions.createYargs"></a>

### `electron-builder/out/cli/cliOptions.createYargs()` ⇒ <code>any</code>
**Kind**: method of <code>[electron-builder/out/cli/cliOptions](#module_electron-builder/out/cli/cliOptions)</code>  

-

<a name="module_electron-builder/out/codeSign"></a>

## electron-builder/out/codeSign

* [electron-builder/out/codeSign](#module_electron-builder/out/codeSign)
    * [`.CodeSigningInfo`](#module_electron-builder/out/codeSign.CodeSigningInfo)
    * [`.findIdentityRawResult`](#module_electron-builder/out/codeSign.findIdentityRawResult) : <code>Promise</code> &#124; <code>null</code>
    * [`.createKeychain(tmpDir, cscLink, cscKeyPassword, cscILink, cscIKeyPassword)`](#module_electron-builder/out/codeSign.createKeychain) ⇒ <code>Promise</code>
    * [`.downloadCertificate(urlOrBase64, tmpDir)`](#module_electron-builder/out/codeSign.downloadCertificate) ⇒ <code>Promise</code>
    * [`.findIdentity(certType, qualifier, keychain)`](#module_electron-builder/out/codeSign.findIdentity) ⇒ <code>Promise</code>
    * [`.sign(path, name, keychain)`](#module_electron-builder/out/codeSign.sign) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/codeSign.CodeSigningInfo"></a>

### `electron-builder/out/codeSign.CodeSigningInfo`
**Kind**: interface of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  
**Properties**

| Name | Type |
| --- | --- |
| keychainName| <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/codeSign.findIdentityRawResult"></a>

### `electron-builder/out/codeSign.findIdentityRawResult` : <code>Promise</code> &#124; <code>null</code>
**Kind**: property of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

-

<a name="module_electron-builder/out/codeSign.createKeychain"></a>

### `electron-builder/out/codeSign.createKeychain(tmpDir, cscLink, cscKeyPassword, cscILink, cscIKeyPassword)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| tmpDir | <code>[TmpDir](#module_electron-builder-util/out/tmp.TmpDir)</code> | 
| cscLink | <code>string</code> | 
| cscKeyPassword | <code>string</code> | 
| cscILink | <code>string</code> &#124; <code>null</code> | 
| cscIKeyPassword | <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/codeSign.downloadCertificate"></a>

### `electron-builder/out/codeSign.downloadCertificate(urlOrBase64, tmpDir)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| urlOrBase64 | <code>string</code> | 
| tmpDir | <code>[TmpDir](#module_electron-builder-util/out/tmp.TmpDir)</code> | 


-

<a name="module_electron-builder/out/codeSign.findIdentity"></a>

### `electron-builder/out/codeSign.findIdentity(certType, qualifier, keychain)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| certType | <code>&quot;Developer ID Application&quot;</code> &#124; <code>&quot;Developer ID Installer&quot;</code> &#124; <code>&quot;3rd Party Mac Developer Application&quot;</code> &#124; <code>&quot;3rd Party Mac Developer Installer&quot;</code> &#124; <code>&quot;Mac Developer&quot;</code> | 
| qualifier | <code>string</code> &#124; <code>null</code> | 
| keychain | <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/codeSign.sign"></a>

### `electron-builder/out/codeSign.sign(path, name, keychain)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/codeSign](#module_electron-builder/out/codeSign)</code>  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 
| name | <code>string</code> | 
| keychain | <code>string</code> | 


-

<a name="module_electron-builder/out/fileMatcher"></a>

## electron-builder/out/fileMatcher

* [electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)
    * [.FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)
        * [`.addAllPattern()`](#module_electron-builder/out/fileMatcher.FileMatcher+addAllPattern)
        * [`.addPattern(pattern)`](#module_electron-builder/out/fileMatcher.FileMatcher+addPattern)
        * [`.computeParsedPatterns(result, fromDir)`](#module_electron-builder/out/fileMatcher.FileMatcher+computeParsedPatterns)
        * [`.containsOnlyIgnore()`](#module_electron-builder/out/fileMatcher.FileMatcher+containsOnlyIgnore) ⇒ <code>boolean</code>
        * [`.createFilter(ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/fileMatcher.FileMatcher+createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
        * [`.isEmpty()`](#module_electron-builder/out/fileMatcher.FileMatcher+isEmpty) ⇒ <code>boolean</code>
    * [`.copyFiles(patterns)`](#module_electron-builder/out/fileMatcher.copyFiles) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/fileMatcher.FileMatcher"></a>

### electron-builder/out/fileMatcher.FileMatcher
**Kind**: class of <code>[electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)</code>  

* [.FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)
    * [`.addAllPattern()`](#module_electron-builder/out/fileMatcher.FileMatcher+addAllPattern)
    * [`.addPattern(pattern)`](#module_electron-builder/out/fileMatcher.FileMatcher+addPattern)
    * [`.computeParsedPatterns(result, fromDir)`](#module_electron-builder/out/fileMatcher.FileMatcher+computeParsedPatterns)
    * [`.containsOnlyIgnore()`](#module_electron-builder/out/fileMatcher.FileMatcher+containsOnlyIgnore) ⇒ <code>boolean</code>
    * [`.createFilter(ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/fileMatcher.FileMatcher+createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
    * [`.isEmpty()`](#module_electron-builder/out/fileMatcher.FileMatcher+isEmpty) ⇒ <code>boolean</code>


-

<a name="module_electron-builder/out/fileMatcher.FileMatcher+addAllPattern"></a>

#### `fileMatcher.addAllPattern()`
**Kind**: instance method of <code>[FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)</code>  

-

<a name="module_electron-builder/out/fileMatcher.FileMatcher+addPattern"></a>

#### `fileMatcher.addPattern(pattern)`
**Kind**: instance method of <code>[FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 


-

<a name="module_electron-builder/out/fileMatcher.FileMatcher+computeParsedPatterns"></a>

#### `fileMatcher.computeParsedPatterns(result, fromDir)`
**Kind**: instance method of <code>[FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)</code>  

| Param | Type |
| --- | --- |
| result | <code>Array</code> | 
| fromDir | <code>string</code> | 


-

<a name="module_electron-builder/out/fileMatcher.FileMatcher+containsOnlyIgnore"></a>

#### `fileMatcher.containsOnlyIgnore()` ⇒ <code>boolean</code>
**Kind**: instance method of <code>[FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)</code>  

-

<a name="module_electron-builder/out/fileMatcher.FileMatcher+createFilter"></a>

#### `fileMatcher.createFilter(ignoreFiles, rawFilter, excludePatterns)` ⇒ <code>module:electron-builder-util/out/fs.__type</code>
**Kind**: instance method of <code>[FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)</code>  

| Param | Type |
| --- | --- |
| ignoreFiles | <code>Set</code> | 
| rawFilter | <code>callback</code> | 
| excludePatterns | <code>Array</code> &#124; <code>undefined</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/fileMatcher.FileMatcher+isEmpty"></a>

#### `fileMatcher.isEmpty()` ⇒ <code>boolean</code>
**Kind**: instance method of <code>[FileMatcher](#module_electron-builder/out/fileMatcher.FileMatcher)</code>  

-

<a name="module_electron-builder/out/fileMatcher.copyFiles"></a>

### `electron-builder/out/fileMatcher.copyFiles(patterns)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/fileMatcher](#module_electron-builder/out/fileMatcher)</code>  

| Param | Type |
| --- | --- |
| patterns | <code>Array</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/linuxPackager"></a>

## electron-builder/out/linuxPackager

* [electron-builder/out/linuxPackager](#module_electron-builder/out/linuxPackager)
    * [.LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/linuxPackager.LinuxPackager+createTargets)
        * [`.postInitApp(appOutDir)`](#module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp) ⇒ <code>Promise</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>


-

<a name="module_electron-builder/out/linuxPackager.LinuxPackager"></a>

### electron-builder/out/linuxPackager.LinuxPackager ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
**Kind**: class of <code>[electron-builder/out/linuxPackager](#module_electron-builder/out/linuxPackager)</code>  
**Extends**: <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

* [.LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/linuxPackager.LinuxPackager+createTargets)
    * [`.postInitApp(appOutDir)`](#module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp) ⇒ <code>Promise</code>
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
    * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>


-

<a name="module_electron-builder/out/linuxPackager.LinuxPackager+createTargets"></a>

#### `linuxPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Overrides**: <code>[createTargets](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/linuxPackager.LinuxPackager+postInitApp"></a>

#### `linuxPackager.postInitApp(appOutDir)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Overrides**: <code>[postInitApp](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `linuxPackager.getDefaultIcon(ext)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `linuxPackager.dispatchArtifactCreated(file, target, safeArtifactName)`
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](#module_electron-builder-core.Target)</code> &#124; <code>null</code> | 
| safeArtifactName | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `linuxPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#module_electron-builder-core.TargetSpecificOptions)</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>null</code> | 
| defaultPattern | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `linuxPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| extra | <code>any</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `linuxPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `linuxPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| classifier | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| deployment | <code>boolean</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getIconPath"></a>

#### `linuxPackager.getIconPath()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `linuxPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `linuxPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `linuxPackager.getResource(custom, names)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| names | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `linuxPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `linuxPackager.getTempFile(suffix)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `linuxPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `linuxPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `linuxPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `linuxPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `linuxPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `linuxPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
**Kind**: instance method of <code>[LinuxPackager](#module_electron-builder/out/linuxPackager.LinuxPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code> | 


-

<a name="module_electron-builder/out/macPackager"></a>

## electron-builder/out/macPackager

* [electron-builder/out/macPackager](#module_electron-builder/out/macPackager)
    * [.MacPackager](#module_electron-builder/out/macPackager.MacPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/macPackager.MacPackager+createTargets)
        * [`.getIconPath()`](#module_electron-builder/out/macPackager.MacPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/macPackager.MacPackager+pack) ⇒ <code>Promise</code>
        * [`.doFlat(appPath, outFile, identity, keychain)`](#module_electron-builder/out/macPackager.MacPackager+doFlat) ⇒ <code>Promise</code>
        * [`.doSign(opts)`](#module_electron-builder/out/macPackager.MacPackager+doSign) ⇒ <code>Promise</code>
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/macPackager.MacPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/macPackager.MacPackager"></a>

### electron-builder/out/macPackager.MacPackager ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
**Kind**: class of <code>[electron-builder/out/macPackager](#module_electron-builder/out/macPackager)</code>  
**Extends**: <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

* [.MacPackager](#module_electron-builder/out/macPackager.MacPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/macPackager.MacPackager+createTargets)
    * [`.getIconPath()`](#module_electron-builder/out/macPackager.MacPackager+getIconPath) ⇒ <code>Promise</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/macPackager.MacPackager+pack) ⇒ <code>Promise</code>
    * [`.doFlat(appPath, outFile, identity, keychain)`](#module_electron-builder/out/macPackager.MacPackager+doFlat) ⇒ <code>Promise</code>
    * [`.doSign(opts)`](#module_electron-builder/out/macPackager.MacPackager+doSign) ⇒ <code>Promise</code>
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/macPackager.MacPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
    * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/macPackager.MacPackager+createTargets"></a>

#### `macPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Overrides**: <code>[createTargets](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/macPackager.MacPackager+getIconPath"></a>

#### `macPackager.getIconPath()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Overrides**: <code>[getIconPath](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath)</code>  

-

<a name="module_electron-builder/out/macPackager.MacPackager+pack"></a>

#### `macPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Overrides**: <code>[pack](#module_electron-builder/out/platformPackager.PlatformPackager+pack)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/macPackager.MacPackager+doFlat"></a>

#### `macPackager.doFlat(appPath, outFile, identity, keychain)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| outFile | <code>string</code> | 
| identity | <code>string</code> | 
| keychain | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/macPackager.MacPackager+doSign"></a>

#### `macPackager.doSign(opts)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| opts | <code>module:electron-macos-sign.SignOptions</code> | 


-

<a name="module_electron-builder/out/macPackager.MacPackager+prepareAppInfo"></a>

#### `macPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Overrides**: <code>[prepareAppInfo](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `macPackager.getDefaultIcon(ext)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `macPackager.dispatchArtifactCreated(file, target, safeArtifactName)`
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](#module_electron-builder-core.Target)</code> &#124; <code>null</code> | 
| safeArtifactName | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `macPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#module_electron-builder-core.TargetSpecificOptions)</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>null</code> | 
| defaultPattern | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `macPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| extra | <code>any</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `macPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `macPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| classifier | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| deployment | <code>boolean</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `macPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `macPackager.getResource(custom, names)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| names | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `macPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `macPackager.getTempFile(suffix)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `macPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `macPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `macPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `macPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `macPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+postInitApp"></a>

#### `macPackager.postInitApp(executableFile)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[MacPackager](#module_electron-builder/out/macPackager.MacPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| executableFile | <code>string</code> | 


-

<a name="module_electron-builder/out/packager/dirPackager"></a>

## electron-builder/out/packager/dirPackager

-

<a name="module_electron-builder/out/packager/dirPackager.unpackElectron"></a>

### `electron-builder/out/packager/dirPackager.unpackElectron(packager, out, platform, arch, electronVersion)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/packager/dirPackager](#module_electron-builder/out/packager/dirPackager)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code> | 
| out | <code>string</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| electronVersion | <code>string</code> | 


-

<a name="module_electron-builder/out/packager/mac"></a>

## electron-builder/out/packager/mac

* [electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)
    * [`.createApp(packager, appOutDir)`](#module_electron-builder/out/packager/mac.createApp) ⇒ <code>Promise</code>
    * [`.filterCFBundleIdentifier(identifier)`](#module_electron-builder/out/packager/mac.filterCFBundleIdentifier) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/packager/mac.createApp"></a>

### `electron-builder/out/packager/mac.createApp(packager, appOutDir)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code> | 
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/packager/mac.filterCFBundleIdentifier"></a>

### `electron-builder/out/packager/mac.filterCFBundleIdentifier(identifier)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder/out/packager/mac](#module_electron-builder/out/packager/mac)</code>  

| Param | Type |
| --- | --- |
| identifier | <code>string</code> | 


-

<a name="module_electron-builder/out/packager"></a>

## electron-builder/out/packager

-

<a name="module_electron-builder/out/packager.normalizePlatforms"></a>

### `electron-builder/out/packager.normalizePlatforms(rawPlatforms)` ⇒ <code>Array</code>
**Kind**: method of <code>[electron-builder/out/packager](#module_electron-builder/out/packager)</code>  

| Param | Type |
| --- | --- |
| rawPlatforms | <code>Array</code> &#124; <code>string</code> &#124; <code>[Platform](#module_electron-builder-core.Platform)</code> &#124; <code>undefined</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/platformPackager"></a>

## electron-builder/out/platformPackager

* [electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)
    * [.PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise</code>
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
    * [`.normalizeExt(ext)`](#module_electron-builder/out/platformPackager.normalizeExt) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager"></a>

### electron-builder/out/platformPackager.PlatformPackager
**Kind**: class of <code>[electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)</code>  

* [.PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
    * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getIconPath()`](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath) ⇒ <code>Promise</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword) ⇒ <code>any</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.postInitApp(executableFile)`](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp) ⇒ <code>Promise</code>
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+createTargets"></a>

#### `platformPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `platformPackager.getDefaultIcon(ext)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `platformPackager.dispatchArtifactCreated(file, target, safeArtifactName)`
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](#module_electron-builder-core.Target)</code> &#124; <code>null</code> | 
| safeArtifactName | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `platformPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#module_electron-builder-core.TargetSpecificOptions)</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>null</code> | 
| defaultPattern | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `platformPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| extra | <code>any</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `platformPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `platformPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| classifier | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| deployment | <code>boolean</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getIconPath"></a>

#### `platformPackager.getIconPath()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `platformPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `platformPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `platformPackager.getResource(custom, names)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| names | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `platformPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `platformPackager.getTempFile(suffix)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `platformPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `platformPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword"></a>

#### `platformPackager.doGetCscPassword()` ⇒ <code>any</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `platformPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `platformPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+postInitApp"></a>

#### `platformPackager.postInitApp(executableFile)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| executableFile | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `platformPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
**Kind**: instance method of <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code> | 


-

<a name="module_electron-builder/out/platformPackager.normalizeExt"></a>

### `electron-builder/out/platformPackager.normalizeExt(ext)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder/out/platformPackager](#module_electron-builder/out/platformPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 


-

<a name="module_electron-builder/out/publish/PublishManager"></a>

## electron-builder/out/publish/PublishManager

* [electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)
    * [.PublishManager](#module_electron-builder/out/publish/PublishManager.PublishManager) ⇐ <code>module:electron-publish.PublishContext</code>
        * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise</code>
        * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)
        * [`.getOrCreatePublisher(publishConfig, buildInfo)`](#module_electron-builder/out/publish/PublishManager.PublishManager+getOrCreatePublisher) ⇒
    * [`.computeDownloadUrl(publishConfig, fileName, packager, arch)`](#module_electron-builder/out/publish/PublishManager.computeDownloadUrl) ⇒ <code>string</code>
    * [`.createPublisher(context, version, publishConfig, options)`](#module_electron-builder/out/publish/PublishManager.createPublisher) ⇒
    * [`.getPublishConfigs(packager, targetSpecificOptions)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigs) ⇒ <code>Promise</code>
    * [`.getPublishConfigsForUpdateInfo(packager, publishConfigs)`](#module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/publish/PublishManager.PublishManager"></a>

### electron-builder/out/publish/PublishManager.PublishManager ⇐ <code>module:electron-publish.PublishContext</code>
**Kind**: class of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  
**Extends**: <code>module:electron-publish.PublishContext</code>  

* [.PublishManager](#module_electron-builder/out/publish/PublishManager.PublishManager) ⇐ <code>module:electron-publish.PublishContext</code>
    * [`.awaitTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks) ⇒ <code>Promise</code>
    * [`.cancelTasks()`](#module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks)
    * [`.getOrCreatePublisher(publishConfig, buildInfo)`](#module_electron-builder/out/publish/PublishManager.PublishManager+getOrCreatePublisher) ⇒


-

<a name="module_electron-builder/out/publish/PublishManager.PublishManager+awaitTasks"></a>

#### `publishManager.awaitTasks()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PublishManager](#module_electron-builder/out/publish/PublishManager.PublishManager)</code>  

-

<a name="module_electron-builder/out/publish/PublishManager.PublishManager+cancelTasks"></a>

#### `publishManager.cancelTasks()`
**Kind**: instance method of <code>[PublishManager](#module_electron-builder/out/publish/PublishManager.PublishManager)</code>  

-

<a name="module_electron-builder/out/publish/PublishManager.PublishManager+getOrCreatePublisher"></a>

#### `publishManager.getOrCreatePublisher(publishConfig, buildInfo)` ⇒
**Kind**: instance method of <code>[PublishManager](#module_electron-builder/out/publish/PublishManager.PublishManager)</code>  

| Param | Type |
| --- | --- |
| publishConfig | <code>module:electron-builder-http/out/publishOptions.PublishConfiguration</code> | 
| buildInfo | <code>module:electron-builder.BuildInfo</code> | 


-

<a name="module_electron-builder/out/publish/PublishManager.computeDownloadUrl"></a>

### `electron-builder/out/publish/PublishManager.computeDownloadUrl(publishConfig, fileName, packager, arch)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| publishConfig | <code>module:electron-builder-http/out/publishOptions.PublishConfiguration</code> | 
| fileName | <code>string</code> &#124; <code>null</code> | 
| packager | <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/publish/PublishManager.createPublisher"></a>

### `electron-builder/out/publish/PublishManager.createPublisher(context, version, publishConfig, options)` ⇒
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| context | <code>module:electron-publish.PublishContext</code> | 
| version | <code>string</code> | 
| publishConfig | <code>module:electron-builder-http/out/publishOptions.PublishConfiguration</code> | 
| options | <code>module:electron-publish.PublishOptions</code> | 


-

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigs"></a>

### `electron-builder/out/publish/PublishManager.getPublishConfigs(packager, targetSpecificOptions)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code> | 
| targetSpecificOptions | <code>module:electron-builder.PlatformSpecificBuildOptions</code> &#124; <code>null</code> &#124; <code>undefined</code> | 


-

<a name="module_electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo"></a>

### `electron-builder/out/publish/PublishManager.getPublishConfigsForUpdateInfo(packager, publishConfigs)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/publish/PublishManager](#module_electron-builder/out/publish/PublishManager)</code>  

| Param | Type |
| --- | --- |
| packager | <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code> | 
| publishConfigs | <code>Array</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/publish/publisher"></a>

## electron-builder/out/publish/publisher

* [electron-builder/out/publish/publisher](#module_electron-builder/out/publish/publisher)
    * [`.getCiTag()`](#module_electron-builder/out/publish/publisher.getCiTag) ⇒ <code>any</code>
    * [`.getResolvedPublishConfig(packager, publishConfig, errorIfCannot)`](#module_electron-builder/out/publish/publisher.getResolvedPublishConfig) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/publish/publisher.getCiTag"></a>

### `electron-builder/out/publish/publisher.getCiTag()` ⇒ <code>any</code>
**Kind**: method of <code>[electron-builder/out/publish/publisher](#module_electron-builder/out/publish/publisher)</code>  

-

<a name="module_electron-builder/out/publish/publisher.getResolvedPublishConfig"></a>

### `electron-builder/out/publish/publisher.getResolvedPublishConfig(packager, publishConfig, errorIfCannot)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/publish/publisher](#module_electron-builder/out/publish/publisher)</code>  

| Param | Type |
| --- | --- |
| packager | <code>module:electron-builder.BuildInfo</code> | 
| publishConfig | <code>module:electron-builder-http/out/publishOptions.PublishConfiguration</code> | 
| errorIfCannot | <code>boolean</code> | 


-

<a name="module_electron-builder/out/readInstalled"></a>

## electron-builder/out/readInstalled

* [electron-builder/out/readInstalled](#module_electron-builder/out/readInstalled)
    * [`.Dependency`](#module_electron-builder/out/readInstalled.Dependency)
    * [`.readInstalled(folder)`](#module_electron-builder/out/readInstalled.readInstalled) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/readInstalled.Dependency"></a>

### `electron-builder/out/readInstalled.Dependency`
**Kind**: interface of <code>[electron-builder/out/readInstalled](#module_electron-builder/out/readInstalled)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **path**| <code>string</code> | 
| **extraneous**| <code>boolean</code> | 
| **optional**| <code>boolean</code> | 
| **dependencies**| <code>module:electron-builder/out/readInstalled.__type</code> | 


-

<a name="module_electron-builder/out/readInstalled.readInstalled"></a>

### `electron-builder/out/readInstalled.readInstalled(folder)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/readInstalled](#module_electron-builder/out/readInstalled)</code>  

| Param | Type |
| --- | --- |
| folder | <code>string</code> | 


-

<a name="module_electron-builder/out/repositoryInfo"></a>

## electron-builder/out/repositoryInfo

* [electron-builder/out/repositoryInfo](#module_electron-builder/out/repositoryInfo)
    * [`.RepositorySlug`](#module_electron-builder/out/repositoryInfo.RepositorySlug)
    * [`.getRepositoryInfo(projectDir, metadata, devMetadata)`](#module_electron-builder/out/repositoryInfo.getRepositoryInfo) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/repositoryInfo.RepositorySlug"></a>

### `electron-builder/out/repositoryInfo.RepositorySlug`
**Kind**: interface of <code>[electron-builder/out/repositoryInfo](#module_electron-builder/out/repositoryInfo)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **user**| <code>string</code> | 
| **project**| <code>string</code> | 


-

<a name="module_electron-builder/out/repositoryInfo.getRepositoryInfo"></a>

### `electron-builder/out/repositoryInfo.getRepositoryInfo(projectDir, metadata, devMetadata)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/repositoryInfo](#module_electron-builder/out/repositoryInfo)</code>  

| Param | Type |
| --- | --- |
| projectDir | <code>string</code> | 
| metadata | <code>module:electron-builder.Metadata</code> | 
| devMetadata | <code>module:electron-builder.Metadata</code> | 


-

<a name="module_electron-builder/out/targets/ArchiveTarget"></a>

## electron-builder/out/targets/ArchiveTarget

* [electron-builder/out/targets/ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget)
    * [.ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget"></a>

### electron-builder/out/targets/ArchiveTarget.ArchiveTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget+build"></a>

#### `archiveTarget.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `archiveTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ArchiveTarget](#module_electron-builder/out/targets/ArchiveTarget.ArchiveTarget)</code>  

-

<a name="module_electron-builder/out/targets/LinuxTargetHelper"></a>

## electron-builder/out/targets/LinuxTargetHelper

* [electron-builder/out/targets/LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper)
    * [.LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper)
        * [`.computeDesktopEntry(platformSpecificBuildOptions, exec, destination, extra)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+computeDesktopEntry) ⇒ <code>Promise</code>
        * [`.getDescription(options)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper"></a>

### electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper
**Kind**: class of <code>[electron-builder/out/targets/LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper)</code>  

* [.LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper)
    * [`.computeDesktopEntry(platformSpecificBuildOptions, exec, destination, extra)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+computeDesktopEntry) ⇒ <code>Promise</code>
    * [`.getDescription(options)`](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+computeDesktopEntry"></a>

#### `linuxTargetHelper.computeDesktopEntry(platformSpecificBuildOptions, exec, destination, extra)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper)</code>  

| Param | Type |
| --- | --- |
| platformSpecificBuildOptions | <code>module:electron-builder.LinuxBuildOptions</code> | 
| exec | <code>string</code> | 
| destination | <code>string</code> &#124; <code>null</code> | 
| extra | <code>module:electron-builder/out/targets/LinuxTargetHelper.__type</code> | 


-

<a name="module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper+getDescription"></a>

#### `linuxTargetHelper.getDescription(options)` ⇒ <code>string</code>
**Kind**: instance method of <code>[LinuxTargetHelper](#module_electron-builder/out/targets/LinuxTargetHelper.LinuxTargetHelper)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:electron-builder.LinuxBuildOptions</code> | 


-

<a name="module_electron-builder/out/targets/WebInstaller"></a>

## electron-builder/out/targets/WebInstaller

* [electron-builder/out/targets/WebInstaller](#module_electron-builder/out/targets/WebInstaller)
    * [.WebInstallerTarget](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget) ⇐ <code>module:electron-builder/out/targets/nsis.default</code>
        * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+configureDefines) ⇒ <code>Promise</code>
        * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+generateGitHubInstallerName) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/targets/WebInstaller.WebInstallerTarget"></a>

### electron-builder/out/targets/WebInstaller.WebInstallerTarget ⇐ <code>module:electron-builder/out/targets/nsis.default</code>
**Kind**: class of <code>[electron-builder/out/targets/WebInstaller](#module_electron-builder/out/targets/WebInstaller)</code>  
**Extends**: <code>module:electron-builder/out/targets/nsis.default</code>  

* [.WebInstallerTarget](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget) ⇐ <code>module:electron-builder/out/targets/nsis.default</code>
    * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+configureDefines) ⇒ <code>Promise</code>
    * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+generateGitHubInstallerName) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+configureDefines"></a>

#### `webInstallerTarget.configureDefines(oneClick, defines)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WebInstallerTarget](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| oneClick | <code>boolean</code> | 
| defines | <code>any</code> | 


-

<a name="module_electron-builder/out/targets/WebInstaller.WebInstallerTarget+generateGitHubInstallerName"></a>

#### `webInstallerTarget.generateGitHubInstallerName()` ⇒ <code>string</code>
**Kind**: instance method of <code>[WebInstallerTarget](#module_electron-builder/out/targets/WebInstaller.WebInstallerTarget)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/targets/appImage"></a>

## electron-builder/out/targets/appImage

* [electron-builder/out/targets/appImage](#module_electron-builder/out/targets/appImage)
    * [.AppImageTarget](#module_electron-builder/out/targets/appImage.AppImageTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appImage.AppImageTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/appImage.AppImageTarget"></a>

### electron-builder/out/targets/appImage.AppImageTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/appImage](#module_electron-builder/out/targets/appImage)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.AppImageTarget](#module_electron-builder/out/targets/appImage.AppImageTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appImage.AppImageTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/appImage.AppImageTarget+build"></a>

#### `appImageTarget.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppImageTarget](#module_electron-builder/out/targets/appImage.AppImageTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `appImageTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppImageTarget](#module_electron-builder/out/targets/appImage.AppImageTarget)</code>  

-

<a name="module_electron-builder/out/targets/appx"></a>

## electron-builder/out/targets/appx

* [electron-builder/out/targets/appx](#module_electron-builder/out/targets/appx)
    * [.AppXTarget](#module_electron-builder/out/targets/appx.AppXTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appx.AppXTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/appx.AppXTarget"></a>

### electron-builder/out/targets/appx.AppXTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/appx](#module_electron-builder/out/targets/appx)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.AppXTarget](#module_electron-builder/out/targets/appx.AppXTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/appx.AppXTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/appx.AppXTarget+build"></a>

#### `appXTarget.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppXTarget](#module_electron-builder/out/targets/appx.AppXTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `appXTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[AppXTarget](#module_electron-builder/out/targets/appx.AppXTarget)</code>  

-

<a name="module_electron-builder/out/targets/archive"></a>

## electron-builder/out/targets/archive

* [electron-builder/out/targets/archive](#module_electron-builder/out/targets/archive)
    * [`.archive(compression, format, outFile, dirToArchive, withoutDir)`](#module_electron-builder/out/targets/archive.archive) ⇒ <code>Promise</code>
    * [`.tar(compression, format, outFile, dirToArchive, isMacApp)`](#module_electron-builder/out/targets/archive.tar) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/archive.archive"></a>

### `electron-builder/out/targets/archive.archive(compression, format, outFile, dirToArchive, withoutDir)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/targets/archive](#module_electron-builder/out/targets/archive)</code>  

| Param | Type |
| --- | --- |
| compression | <code>&quot;store&quot;</code> &#124; <code>&quot;normal&quot;</code> &#124; <code>&quot;maximum&quot;</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| format | <code>string</code> | 
| outFile | <code>string</code> | 
| dirToArchive | <code>string</code> | 
| withoutDir | <code>boolean</code> | 


-

<a name="module_electron-builder/out/targets/archive.tar"></a>

### `electron-builder/out/targets/archive.tar(compression, format, outFile, dirToArchive, isMacApp)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/targets/archive](#module_electron-builder/out/targets/archive)</code>  

| Param | Type |
| --- | --- |
| compression | <code>&quot;store&quot;</code> &#124; <code>&quot;normal&quot;</code> &#124; <code>&quot;maximum&quot;</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| format | <code>string</code> | 
| outFile | <code>string</code> | 
| dirToArchive | <code>string</code> | 
| isMacApp | <code>boolean</code> | 


-

<a name="module_electron-builder/out/targets/dmg"></a>

## electron-builder/out/targets/dmg

* [electron-builder/out/targets/dmg](#module_electron-builder/out/targets/dmg)
    * [.DmgTarget](#module_electron-builder/out/targets/dmg.DmgTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appPath, arch)`](#module_electron-builder/out/targets/dmg.DmgTarget+build) ⇒ <code>Promise</code>
        * [`.computeDmgOptions()`](#module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions) ⇒ <code>Promise</code>
        * [`.computeVolumeName(custom)`](#module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName) ⇒ <code>string</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.attachAndExecute(dmgPath, readWrite, task)`](#module_electron-builder/out/targets/dmg.attachAndExecute) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/dmg.DmgTarget"></a>

### electron-builder/out/targets/dmg.DmgTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/dmg](#module_electron-builder/out/targets/dmg)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.DmgTarget](#module_electron-builder/out/targets/dmg.DmgTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appPath, arch)`](#module_electron-builder/out/targets/dmg.DmgTarget+build) ⇒ <code>Promise</code>
    * [`.computeDmgOptions()`](#module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions) ⇒ <code>Promise</code>
    * [`.computeVolumeName(custom)`](#module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName) ⇒ <code>string</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/dmg.DmgTarget+build"></a>

#### `dmgTarget.build(appPath, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[DmgTarget](#module_electron-builder/out/targets/dmg.DmgTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder/out/targets/dmg.DmgTarget+computeDmgOptions"></a>

#### `dmgTarget.computeDmgOptions()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[DmgTarget](#module_electron-builder/out/targets/dmg.DmgTarget)</code>  

-

<a name="module_electron-builder/out/targets/dmg.DmgTarget+computeVolumeName"></a>

#### `dmgTarget.computeVolumeName(custom)` ⇒ <code>string</code>
**Kind**: instance method of <code>[DmgTarget](#module_electron-builder/out/targets/dmg.DmgTarget)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `dmgTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[DmgTarget](#module_electron-builder/out/targets/dmg.DmgTarget)</code>  

-

<a name="module_electron-builder/out/targets/dmg.attachAndExecute"></a>

### `electron-builder/out/targets/dmg.attachAndExecute(dmgPath, readWrite, task)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/targets/dmg](#module_electron-builder/out/targets/dmg)</code>  

| Param | Type |
| --- | --- |
| dmgPath | <code>string</code> | 
| readWrite | <code>boolean</code> | 
| task | <code>callback</code> | 


-

<a name="module_electron-builder/out/targets/fpm"></a>

## electron-builder/out/targets/fpm

* [electron-builder/out/targets/fpm](#module_electron-builder/out/targets/fpm)
    * [.FpmTarget](#module_electron-builder/out/targets/fpm.FpmTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/fpm.FpmTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/fpm.FpmTarget"></a>

### electron-builder/out/targets/fpm.FpmTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/fpm](#module_electron-builder/out/targets/fpm)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.FpmTarget](#module_electron-builder/out/targets/fpm.FpmTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/fpm.FpmTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/fpm.FpmTarget+build"></a>

#### `fpmTarget.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[FpmTarget](#module_electron-builder/out/targets/fpm.FpmTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `fpmTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[FpmTarget](#module_electron-builder/out/targets/fpm.FpmTarget)</code>  

-

<a name="module_electron-builder/out/targets/nsis"></a>

## electron-builder/out/targets/nsis

* [electron-builder/out/targets/nsis](#module_electron-builder/out/targets/nsis)
    * [.NsisTarget](#module_electron-builder/out/targets/nsis.NsisTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise</code>
        * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/nsis.NsisTarget+configureDefines) ⇒ <code>Promise</code>
        * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/targets/nsis.NsisTarget"></a>

### electron-builder/out/targets/nsis.NsisTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/nsis](#module_electron-builder/out/targets/nsis)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.NsisTarget](#module_electron-builder/out/targets/nsis.NsisTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/nsis.NsisTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder/out/targets/nsis.NsisTarget+finishBuild) ⇒ <code>Promise</code>
    * [`.configureDefines(oneClick, defines)`](#module_electron-builder/out/targets/nsis.NsisTarget+configureDefines) ⇒ <code>Promise</code>
    * [`.generateGitHubInstallerName()`](#module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName) ⇒ <code>string</code>


-

<a name="module_electron-builder/out/targets/nsis.NsisTarget+build"></a>

#### `nsisTarget.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NsisTarget](#module_electron-builder/out/targets/nsis.NsisTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder/out/targets/nsis.NsisTarget+finishBuild"></a>

#### `nsisTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NsisTarget](#module_electron-builder/out/targets/nsis.NsisTarget)</code>  
**Overrides**: <code>[finishBuild](#module_electron-builder-core.Target+finishBuild)</code>  

-

<a name="module_electron-builder/out/targets/nsis.NsisTarget+configureDefines"></a>

#### `nsisTarget.configureDefines(oneClick, defines)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NsisTarget](#module_electron-builder/out/targets/nsis.NsisTarget)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| oneClick | <code>boolean</code> | 
| defines | <code>any</code> | 


-

<a name="module_electron-builder/out/targets/nsis.NsisTarget+generateGitHubInstallerName"></a>

#### `nsisTarget.generateGitHubInstallerName()` ⇒ <code>string</code>
**Kind**: instance method of <code>[NsisTarget](#module_electron-builder/out/targets/nsis.NsisTarget)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/targets/pkg"></a>

## electron-builder/out/targets/pkg

* [electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)
    * [.PkgTarget](#module_electron-builder/out/targets/pkg.PkgTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appPath, arch)`](#module_electron-builder/out/targets/pkg.PkgTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.prepareProductBuildArgs(identity, keychain)`](#module_electron-builder/out/targets/pkg.prepareProductBuildArgs) ⇒ <code>Array</code>


-

<a name="module_electron-builder/out/targets/pkg.PkgTarget"></a>

### electron-builder/out/targets/pkg.PkgTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.PkgTarget](#module_electron-builder/out/targets/pkg.PkgTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appPath, arch)`](#module_electron-builder/out/targets/pkg.PkgTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/pkg.PkgTarget+build"></a>

#### `pkgTarget.build(appPath, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PkgTarget](#module_electron-builder/out/targets/pkg.PkgTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appPath | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `pkgTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[PkgTarget](#module_electron-builder/out/targets/pkg.PkgTarget)</code>  

-

<a name="module_electron-builder/out/targets/pkg.prepareProductBuildArgs"></a>

### `electron-builder/out/targets/pkg.prepareProductBuildArgs(identity, keychain)` ⇒ <code>Array</code>
**Kind**: method of <code>[electron-builder/out/targets/pkg](#module_electron-builder/out/targets/pkg)</code>  

| Param | Type |
| --- | --- |
| identity | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| keychain | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/targets/snap"></a>

## electron-builder/out/targets/snap

* [electron-builder/out/targets/snap](#module_electron-builder/out/targets/snap)
    * [.SnapTarget](#module_electron-builder/out/targets/snap.SnapTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/snap.SnapTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/snap.SnapTarget"></a>

### electron-builder/out/targets/snap.SnapTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/snap](#module_electron-builder/out/targets/snap)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.SnapTarget](#module_electron-builder/out/targets/snap.SnapTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/snap.SnapTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/snap.SnapTarget+build"></a>

#### `snapTarget.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[SnapTarget](#module_electron-builder/out/targets/snap.SnapTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `snapTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[SnapTarget](#module_electron-builder/out/targets/snap.SnapTarget)</code>  

-

<a name="module_electron-builder/out/targets/targetFactory"></a>

## electron-builder/out/targets/targetFactory

* [electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)
    * [.NoOpTarget](#module_electron-builder/out/targets/targetFactory.NoOpTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
        * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/targetFactory.NoOpTarget+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.computeArchToTargetNamesMap(raw, options, platform)`](#module_electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap) ⇒ <code>Map</code>
    * [`.createCommonTarget(target, outDir, packager)`](#module_electron-builder/out/targets/targetFactory.createCommonTarget) ⇒ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.createTargets(nameToTarget, rawList, outDir, packager, cleanupTasks)`](#module_electron-builder/out/targets/targetFactory.createTargets) ⇒ <code>Array</code>


-

<a name="module_electron-builder/out/targets/targetFactory.NoOpTarget"></a>

### electron-builder/out/targets/targetFactory.NoOpTarget ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: class of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  
**Extends**: <code>[Target](#module_electron-builder-core.Target)</code>  

* [.NoOpTarget](#module_electron-builder/out/targets/targetFactory.NoOpTarget) ⇐ <code>[Target](#module_electron-builder-core.Target)</code>
    * [`.build(appOutDir, arch)`](#module_electron-builder/out/targets/targetFactory.NoOpTarget+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/targets/targetFactory.NoOpTarget+build"></a>

#### `noOpTarget.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NoOpTarget](#module_electron-builder/out/targets/targetFactory.NoOpTarget)</code>  
**Overrides**: <code>[build](#module_electron-builder-core.Target+build)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `noOpTarget.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NoOpTarget](#module_electron-builder/out/targets/targetFactory.NoOpTarget)</code>  

-

<a name="module_electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap"></a>

### `electron-builder/out/targets/targetFactory.computeArchToTargetNamesMap(raw, options, platform)` ⇒ <code>Map</code>
**Kind**: method of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  

| Param | Type |
| --- | --- |
| raw | <code>Map</code> | 
| options | <code>module:electron-builder.PlatformSpecificBuildOptions</code> | 
| platform | <code>[Platform](#module_electron-builder-core.Platform)</code> | 


-

<a name="module_electron-builder/out/targets/targetFactory.createCommonTarget"></a>

### `electron-builder/out/targets/targetFactory.createCommonTarget(target, outDir, packager)` ⇒ <code>[Target](#module_electron-builder-core.Target)</code>
**Kind**: method of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  

| Param | Type |
| --- | --- |
| target | <code>string</code> | 
| outDir | <code>string</code> | 
| packager | <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code> | 


-

<a name="module_electron-builder/out/targets/targetFactory.createTargets"></a>

### `electron-builder/out/targets/targetFactory.createTargets(nameToTarget, rawList, outDir, packager, cleanupTasks)` ⇒ <code>Array</code>
**Kind**: method of <code>[electron-builder/out/targets/targetFactory](#module_electron-builder/out/targets/targetFactory)</code>  

| Param | Type |
| --- | --- |
| nameToTarget | <code>Map</code> | 
| rawList | <code>Array</code> | 
| outDir | <code>string</code> | 
| packager | <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code> | 
| cleanupTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/util/filter"></a>

## electron-builder/out/util/filter

* [electron-builder/out/util/filter](#module_electron-builder/out/util/filter)
    * [`.createFilter(src, patterns, ignoreFiles, rawFilter, excludePatterns)`](#module_electron-builder/out/util/filter.createFilter) ⇒ <code>module:electron-builder-util/out/fs.__type</code>
    * [`.hasMagic(pattern)`](#module_electron-builder/out/util/filter.hasMagic) ⇒ <code>boolean</code>


-

<a name="module_electron-builder/out/util/filter.createFilter"></a>

### `electron-builder/out/util/filter.createFilter(src, patterns, ignoreFiles, rawFilter, excludePatterns)` ⇒ <code>module:electron-builder-util/out/fs.__type</code>
**Kind**: method of <code>[electron-builder/out/util/filter](#module_electron-builder/out/util/filter)</code>  

| Param | Type |
| --- | --- |
| src | <code>string</code> | 
| patterns | <code>Array</code> | 
| ignoreFiles | <code>Set</code> | 
| rawFilter | <code>callback</code> | 
| excludePatterns | <code>Array</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/util/filter.hasMagic"></a>

### `electron-builder/out/util/filter.hasMagic(pattern)` ⇒ <code>boolean</code>
**Kind**: method of <code>[electron-builder/out/util/filter](#module_electron-builder/out/util/filter)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>minimatch:Minimatch</code> | 


-

<a name="module_electron-builder/out/util/readPackageJson"></a>

## electron-builder/out/util/readPackageJson

* [electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)
    * [`.doLoadConfig(configFile, projectDir)`](#module_electron-builder/out/util/readPackageJson.doLoadConfig) ⇒ <code>Promise</code>
    * [`.getElectronVersion(config, projectDir, projectMetadata)`](#module_electron-builder/out/util/readPackageJson.getElectronVersion) ⇒ <code>Promise</code>
    * [`.loadConfig(projectDir)`](#module_electron-builder/out/util/readPackageJson.loadConfig) ⇒ <code>Promise</code>
    * [`.readPackageJson(file)`](#module_electron-builder/out/util/readPackageJson.readPackageJson) ⇒ <code>Promise</code>
    * [`.validateConfig(config)`](#module_electron-builder/out/util/readPackageJson.validateConfig) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/util/readPackageJson.doLoadConfig"></a>

### `electron-builder/out/util/readPackageJson.doLoadConfig(configFile, projectDir)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| configFile | <code>string</code> | 
| projectDir | <code>string</code> | 


-

<a name="module_electron-builder/out/util/readPackageJson.getElectronVersion"></a>

### `electron-builder/out/util/readPackageJson.getElectronVersion(config, projectDir, projectMetadata)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| config | <code>module:electron-builder.Config</code> &#124; <code>null</code> &#124; <code>undefined</code> | 
| projectDir | <code>string</code> | 
| projectMetadata | <code>any</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/util/readPackageJson.loadConfig"></a>

### `electron-builder/out/util/readPackageJson.loadConfig(projectDir)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| projectDir | <code>string</code> | 


-

<a name="module_electron-builder/out/util/readPackageJson.readPackageJson"></a>

### `electron-builder/out/util/readPackageJson.readPackageJson(file)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 


-

<a name="module_electron-builder/out/util/readPackageJson.validateConfig"></a>

### `electron-builder/out/util/readPackageJson.validateConfig(config)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/util/readPackageJson](#module_electron-builder/out/util/readPackageJson)</code>  

| Param | Type |
| --- | --- |
| config | <code>module:electron-builder.Config</code> | 


-

<a name="module_electron-builder/out/winPackager"></a>

## electron-builder/out/winPackager

* [electron-builder/out/winPackager](#module_electron-builder/out/winPackager)
    * [.WinPackager](#module_electron-builder/out/winPackager.WinPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
        * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/winPackager.WinPackager+createTargets)
        * [`.getIconPath()`](#module_electron-builder/out/winPackager.WinPackager+getIconPath) ⇒ <code>Promise</code>
        * [`.sign(file, logMessagePrefix)`](#module_electron-builder/out/winPackager.WinPackager+sign) ⇒ <code>Promise</code>
        * [`.signAndEditResources(file)`](#module_electron-builder/out/winPackager.WinPackager+signAndEditResources) ⇒ <code>Promise</code>
        * [`.doGetCscPassword()`](#module_electron-builder/out/winPackager.WinPackager+doGetCscPassword) ⇒ <code>string</code>
        * [`.doSign(options)`](#module_electron-builder/out/winPackager.WinPackager+doSign) ⇒ <code>Promise</code>
        * [`.postInitApp(appOutDir)`](#module_electron-builder/out/winPackager.WinPackager+postInitApp) ⇒ <code>Promise</code>
        * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
        * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
        * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
        * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
        * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
        * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
        * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
        * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
        * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
        * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
        * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
        * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
        * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
        * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
        * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
        * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>


-

<a name="module_electron-builder/out/winPackager.WinPackager"></a>

### electron-builder/out/winPackager.WinPackager ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
**Kind**: class of <code>[electron-builder/out/winPackager](#module_electron-builder/out/winPackager)</code>  
**Extends**: <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>  

* [.WinPackager](#module_electron-builder/out/winPackager.WinPackager) ⇐ <code>[PlatformPackager](#module_electron-builder/out/platformPackager.PlatformPackager)</code>
    * [`.createTargets(targets, mapper, cleanupTasks)`](#module_electron-builder/out/winPackager.WinPackager+createTargets)
    * [`.getIconPath()`](#module_electron-builder/out/winPackager.WinPackager+getIconPath) ⇒ <code>Promise</code>
    * [`.sign(file, logMessagePrefix)`](#module_electron-builder/out/winPackager.WinPackager+sign) ⇒ <code>Promise</code>
    * [`.signAndEditResources(file)`](#module_electron-builder/out/winPackager.WinPackager+signAndEditResources) ⇒ <code>Promise</code>
    * [`.doGetCscPassword()`](#module_electron-builder/out/winPackager.WinPackager+doGetCscPassword) ⇒ <code>string</code>
    * [`.doSign(options)`](#module_electron-builder/out/winPackager.WinPackager+doSign) ⇒ <code>Promise</code>
    * [`.postInitApp(appOutDir)`](#module_electron-builder/out/winPackager.WinPackager+postInitApp) ⇒ <code>Promise</code>
    * [`.getDefaultIcon(ext)`](#module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon) ⇒ <code>Promise</code>
    * [`.dispatchArtifactCreated(file, target, safeArtifactName)`](#module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated)
    * [`.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern) ⇒ <code>string</code>
    * [`.expandMacro(pattern, arch, extra)`](#module_electron-builder/out/platformPackager.PlatformPackager+expandMacro) ⇒ <code>string</code>
    * [`.generateName(ext, arch, deployment, classifier)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName) ⇒ <code>string</code>
    * [`.generateName2(ext, classifier, deployment)`](#module_electron-builder/out/platformPackager.PlatformPackager+generateName2) ⇒ <code>string</code>
    * [`.getMacOsResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir) ⇒ <code>string</code>
    * [`.pack(outDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+pack) ⇒ <code>Promise</code>
    * [`.getResource(custom, names)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResource) ⇒ <code>Promise</code>
    * [`.getResourcesDir(appOutDir)`](#module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir) ⇒ <code>string</code>
    * [`.getTempFile(suffix)`](#module_electron-builder/out/platformPackager.PlatformPackager+getTempFile) ⇒ <code>Promise</code>
    * [`.computeAppOutDir(outDir, arch)`](#module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir) ⇒ <code>string</code>
    * [`.getCscPassword()`](#module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword) ⇒ <code>string</code>
    * [`.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)`](#module_electron-builder/out/platformPackager.PlatformPackager+doPack) ⇒ <code>Promise</code>
    * [`.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`](#module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat)
    * [`.prepareAppInfo(appInfo)`](#module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo) ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>


-

<a name="module_electron-builder/out/winPackager.WinPackager+createTargets"></a>

#### `winPackager.createTargets(targets, mapper, cleanupTasks)`
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Overrides**: <code>[createTargets](#module_electron-builder/out/platformPackager.PlatformPackager+createTargets)</code>  

| Param | Type |
| --- | --- |
| targets | <code>Array</code> | 
| mapper | <code>callback</code> | 
| cleanupTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/winPackager.WinPackager+getIconPath"></a>

#### `winPackager.getIconPath()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Overrides**: <code>[getIconPath](#module_electron-builder/out/platformPackager.PlatformPackager+getIconPath)</code>  

-

<a name="module_electron-builder/out/winPackager.WinPackager+sign"></a>

#### `winPackager.sign(file, logMessagePrefix)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| logMessagePrefix | <code>string</code> | 


-

<a name="module_electron-builder/out/winPackager.WinPackager+signAndEditResources"></a>

#### `winPackager.signAndEditResources(file)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 


-

<a name="module_electron-builder/out/winPackager.WinPackager+doGetCscPassword"></a>

#### `winPackager.doGetCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Overrides**: <code>[doGetCscPassword](#module_electron-builder/out/platformPackager.PlatformPackager+doGetCscPassword)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/winPackager.WinPackager+doSign"></a>

#### `winPackager.doSign(options)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>[SignOptions](#module_electron-builder/out/windowsCodeSign.SignOptions)</code> | 


-

<a name="module_electron-builder/out/winPackager.WinPackager+postInitApp"></a>

#### `winPackager.postInitApp(appOutDir)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Overrides**: <code>[postInitApp](#module_electron-builder/out/platformPackager.PlatformPackager+postInitApp)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getDefaultIcon"></a>

#### `winPackager.getDefaultIcon(ext)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+dispatchArtifactCreated"></a>

#### `winPackager.dispatchArtifactCreated(file, target, safeArtifactName)`
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| target | <code>[Target](#module_electron-builder-core.Target)</code> &#124; <code>null</code> | 
| safeArtifactName | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandArtifactNamePattern"></a>

#### `winPackager.expandArtifactNamePattern(targetSpecificOptions, ext, arch, defaultPattern)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| targetSpecificOptions | <code>[TargetSpecificOptions](#module_electron-builder-core.TargetSpecificOptions)</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| ext | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>null</code> | 
| defaultPattern | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+expandMacro"></a>

#### `winPackager.expandMacro(pattern, arch, extra)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| pattern | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| extra | <code>any</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName"></a>

#### `winPackager.generateName(ext, arch, deployment, classifier)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| deployment | <code>boolean</code> | 
| classifier | <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+generateName2"></a>

#### `winPackager.generateName2(ext, classifier, deployment)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| ext | <code>string</code> &#124; <code>null</code> | 
| classifier | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| deployment | <code>boolean</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getMacOsResourcesDir"></a>

#### `winPackager.getMacOsResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+pack"></a>

#### `winPackager.pack(outDir, arch, targets, postAsyncTasks)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResource"></a>

#### `winPackager.getResource(custom, names)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| custom | <code>string</code> &#124; <code>undefined</code> &#124; <code>null</code> | 
| names | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getResourcesDir"></a>

#### `winPackager.getResourcesDir(appOutDir)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getTempFile"></a>

#### `winPackager.getTempFile(suffix)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+computeAppOutDir"></a>

#### `winPackager.computeAppOutDir(outDir, arch)` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+getCscPassword"></a>

#### `winPackager.getCscPassword()` ⇒ <code>string</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Access**: protected  

-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+doPack"></a>

#### `winPackager.doPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| outDir | <code>string</code> | 
| appOutDir | <code>string</code> | 
| platformName | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| platformSpecificBuildOptions | <code>module:electron-builder/out/platformPackager.DC</code> | 
| targets | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+packageInDistributableFormat"></a>

#### `winPackager.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)`
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 
| targets | <code>Array</code> | 
| postAsyncTasks | <code>Array</code> | 


-

<a name="module_electron-builder/out/platformPackager.PlatformPackager+prepareAppInfo"></a>

#### `winPackager.prepareAppInfo(appInfo)` ⇒ <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code>
**Kind**: instance method of <code>[WinPackager](#module_electron-builder/out/winPackager.WinPackager)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| appInfo | <code>[AppInfo](#module_electron-builder/out/appInfo.AppInfo)</code> | 


-

<a name="module_electron-builder/out/windowsCodeSign"></a>

## electron-builder/out/windowsCodeSign

* [electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)
    * [`.FileCodeSigningInfo`](#module_electron-builder/out/windowsCodeSign.FileCodeSigningInfo)
    * [`.SignOptions`](#module_electron-builder/out/windowsCodeSign.SignOptions)
    * [`.getSignVendorPath()`](#module_electron-builder/out/windowsCodeSign.getSignVendorPath) ⇒ <code>Promise</code>
    * [`.getToolPath()`](#module_electron-builder/out/windowsCodeSign.getToolPath) ⇒ <code>Promise</code>
    * [`.sign(options)`](#module_electron-builder/out/windowsCodeSign.sign) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/windowsCodeSign.FileCodeSigningInfo"></a>

### `electron-builder/out/windowsCodeSign.FileCodeSigningInfo`
**Kind**: interface of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  
**Properties**

| Name | Type |
| --- | --- |
| file| <code>string</code> &#124; <code>null</code> | 
| password| <code>string</code> &#124; <code>null</code> | 
| subjectName| <code>string</code> &#124; <code>null</code> | 
| certificateSha1| <code>string</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder/out/windowsCodeSign.SignOptions"></a>

### `electron-builder/out/windowsCodeSign.SignOptions`
**Kind**: interface of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **path**| <code>string</code> | 
| cert| <code>string</code> &#124; <code>null</code> | 
| name| <code>string</code> &#124; <code>null</code> | 
| password| <code>string</code> &#124; <code>null</code> | 
| site| <code>string</code> &#124; <code>null</code> | 
| **options**| <code>module:electron-builder.WinBuildOptions</code> | 


-

<a name="module_electron-builder/out/windowsCodeSign.getSignVendorPath"></a>

### `electron-builder/out/windowsCodeSign.getSignVendorPath()` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  

-

<a name="module_electron-builder/out/windowsCodeSign.getToolPath"></a>

### `electron-builder/out/windowsCodeSign.getToolPath()` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  

-

<a name="module_electron-builder/out/windowsCodeSign.sign"></a>

### `electron-builder/out/windowsCodeSign.sign(options)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/windowsCodeSign](#module_electron-builder/out/windowsCodeSign)</code>  

| Param | Type |
| --- | --- |
| options | <code>[SignOptions](#module_electron-builder/out/windowsCodeSign.SignOptions)</code> | 


-

<a name="module_electron-builder/out/yarn"></a>

## electron-builder/out/yarn

* [electron-builder/out/yarn](#module_electron-builder/out/yarn)
    * [`.getGypEnv(electronVersion, platform, arch, buildFromSource)`](#module_electron-builder/out/yarn.getGypEnv) ⇒ <code>any</code>
    * [`.installOrRebuild(config, appDir, electronVersion, platform, arch, forceInstall)`](#module_electron-builder/out/yarn.installOrRebuild) ⇒ <code>Promise</code>
    * [`.rebuild(appDir, electronVersion, platform, arch, additionalArgs, buildFromSource)`](#module_electron-builder/out/yarn.rebuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder/out/yarn.getGypEnv"></a>

### `electron-builder/out/yarn.getGypEnv(electronVersion, platform, arch, buildFromSource)` ⇒ <code>any</code>
**Kind**: method of <code>[electron-builder/out/yarn](#module_electron-builder/out/yarn)</code>  

| Param | Type |
| --- | --- |
| electronVersion | <code>string</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| buildFromSource | <code>boolean</code> | 


-

<a name="module_electron-builder/out/yarn.installOrRebuild"></a>

### `electron-builder/out/yarn.installOrRebuild(config, appDir, electronVersion, platform, arch, forceInstall)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/yarn](#module_electron-builder/out/yarn)</code>  

| Param | Type |
| --- | --- |
| config | <code>module:electron-builder.Config</code> | 
| appDir | <code>string</code> | 
| electronVersion | <code>string</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| forceInstall | <code>boolean</code> | 


-

<a name="module_electron-builder/out/yarn.rebuild"></a>

### `electron-builder/out/yarn.rebuild(appDir, electronVersion, platform, arch, additionalArgs, buildFromSource)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder/out/yarn](#module_electron-builder/out/yarn)</code>  

| Param | Type |
| --- | --- |
| appDir | <code>string</code> | 
| electronVersion | <code>string</code> | 
| platform | <code>string</code> | 
| arch | <code>string</code> | 
| additionalArgs | <code>Array</code> | 
| buildFromSource | <code>boolean</code> | 


-

<a name="module_electron-builder-core"></a>

## electron-builder-core

* [electron-builder-core](#module_electron-builder-core)
    * [`.AsarOptions`](#module_electron-builder-core.AsarOptions)
    * [`.AuthorMetadata`](#module_electron-builder-core.AuthorMetadata)
    * [`.BeforeBuildContext`](#module_electron-builder-core.BeforeBuildContext)
    * [`.FilePattern`](#module_electron-builder-core.FilePattern)
    * [`.RepositoryInfo`](#module_electron-builder-core.RepositoryInfo)
    * [`.TargetConfig`](#module_electron-builder-core.TargetConfig)
    * [`.TargetSpecificOptions`](#module_electron-builder-core.TargetSpecificOptions)
    * [.Platform](#module_electron-builder-core.Platform)
        * [`.createTarget(type, archs)`](#module_electron-builder-core.Platform+createTarget) ⇒ <code>Map</code>
        * [`.current()`](#module_electron-builder-core.Platform+current) ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
        * [`.fromString(name)`](#module_electron-builder-core.Platform+fromString) ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
        * [`.toString()`](#module_electron-builder-core.Platform+toString) ⇒ <code>string</code>
    * [.Target](#module_electron-builder-core.Target)
        * [`.build(appOutDir, arch)`](#module_electron-builder-core.Target+build) ⇒ <code>Promise</code>
        * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>
    * [`.archFromString(name)`](#module_electron-builder-core.archFromString) ⇒ <code>module:electron-builder-core.Arch</code>
    * [`.getArchSuffix(arch)`](#module_electron-builder-core.getArchSuffix) ⇒ <code>string</code>
    * [`.toLinuxArchString(arch)`](#module_electron-builder-core.toLinuxArchString) ⇒


-

<a name="module_electron-builder-core.AsarOptions"></a>

### `electron-builder-core.AsarOptions`
**Kind**: interface of <code>[electron-builder-core](#module_electron-builder-core)</code>  
**Properties**

| Name | Type |
| --- | --- |
| smartUnpack| <code>boolean</code> | 
| ordering| <code>string</code> &#124; <code>null</code> | 
| extraMetadata| <code>any</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-core.AuthorMetadata"></a>

### `electron-builder-core.AuthorMetadata`
**Kind**: interface of <code>[electron-builder-core](#module_electron-builder-core)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| email| <code>string</code> | 


-

<a name="module_electron-builder-core.BeforeBuildContext"></a>

### `electron-builder-core.BeforeBuildContext`
**Kind**: interface of <code>[electron-builder-core](#module_electron-builder-core)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **appDir**| <code>string</code> | 
| **electronVersion**| <code>string</code> | 
| **platform**| <code>[Platform](#module_electron-builder-core.Platform)</code> | 
| **arch**| <code>string</code> | 


-

<a name="module_electron-builder-core.FilePattern"></a>

### `electron-builder-core.FilePattern`
**Kind**: interface of <code>[electron-builder-core](#module_electron-builder-core)</code>  
**Properties**

| Name | Type |
| --- | --- |
| from| <code>string</code> | 
| to| <code>string</code> | 
| filter| <code>Array</code> &#124; <code>string</code> | 


-

<a name="module_electron-builder-core.RepositoryInfo"></a>

### `electron-builder-core.RepositoryInfo`
**Kind**: interface of <code>[electron-builder-core](#module_electron-builder-core)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **url**| <code>string</code> | 


-

<a name="module_electron-builder-core.TargetConfig"></a>

### `electron-builder-core.TargetConfig`
**Kind**: interface of <code>[electron-builder-core](#module_electron-builder-core)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| **target**| <code>string</code> | <a name="TargetConfig-target"></a>The target name. e.g. `snap`. |
| arch| <code>Array</code> &#124; <code>string</code> | <a name="TargetConfig-arch"></a>The arch or list of archs. |


-

<a name="module_electron-builder-core.TargetSpecificOptions"></a>

### `electron-builder-core.TargetSpecificOptions`
**Kind**: interface of <code>[electron-builder-core](#module_electron-builder-core)</code>  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| artifactName| <code>string</code> &#124; <code>null</code> | <a name="TargetSpecificOptions-artifactName"></a>The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern). |
| forceCodeSigning| <code>boolean</code> | <a name="TargetSpecificOptions-forceCodeSigning"></a> |


-

<a name="module_electron-builder-core.Platform"></a>

### electron-builder-core.Platform
**Kind**: class of <code>[electron-builder-core](#module_electron-builder-core)</code>  

* [.Platform](#module_electron-builder-core.Platform)
    * [`.createTarget(type, archs)`](#module_electron-builder-core.Platform+createTarget) ⇒ <code>Map</code>
    * [`.current()`](#module_electron-builder-core.Platform+current) ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
    * [`.fromString(name)`](#module_electron-builder-core.Platform+fromString) ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
    * [`.toString()`](#module_electron-builder-core.Platform+toString) ⇒ <code>string</code>


-

<a name="module_electron-builder-core.Platform+createTarget"></a>

#### `platform.createTarget(type, archs)` ⇒ <code>Map</code>
**Kind**: instance method of <code>[Platform](#module_electron-builder-core.Platform)</code>  

| Param | Type |
| --- | --- |
| type | <code>string</code> &#124; <code>Array</code> &#124; <code>null</code> | 
| archs | <code>Array</code> | 


-

<a name="module_electron-builder-core.Platform+current"></a>

#### `platform.current()` ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
**Kind**: instance method of <code>[Platform](#module_electron-builder-core.Platform)</code>  

-

<a name="module_electron-builder-core.Platform+fromString"></a>

#### `platform.fromString(name)` ⇒ <code>[Platform](#module_electron-builder-core.Platform)</code>
**Kind**: instance method of <code>[Platform](#module_electron-builder-core.Platform)</code>  

| Param | Type |
| --- | --- |
| name | <code>string</code> | 


-

<a name="module_electron-builder-core.Platform+toString"></a>

#### `platform.toString()` ⇒ <code>string</code>
**Kind**: instance method of <code>[Platform](#module_electron-builder-core.Platform)</code>  

-

<a name="module_electron-builder-core.Target"></a>

### electron-builder-core.Target
**Kind**: class of <code>[electron-builder-core](#module_electron-builder-core)</code>  

* [.Target](#module_electron-builder-core.Target)
    * [`.build(appOutDir, arch)`](#module_electron-builder-core.Target+build) ⇒ <code>Promise</code>
    * [`.finishBuild()`](#module_electron-builder-core.Target+finishBuild) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-core.Target+build"></a>

#### `target.build(appOutDir, arch)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[Target](#module_electron-builder-core.Target)</code>  

| Param | Type |
| --- | --- |
| appOutDir | <code>string</code> | 
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.Target+finishBuild"></a>

#### `target.finishBuild()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[Target](#module_electron-builder-core.Target)</code>  

-

<a name="module_electron-builder-core.archFromString"></a>

### `electron-builder-core.archFromString(name)` ⇒ <code>module:electron-builder-core.Arch</code>
**Kind**: method of <code>[electron-builder-core](#module_electron-builder-core)</code>  

| Param | Type |
| --- | --- |
| name | <code>string</code> | 


-

<a name="module_electron-builder-core.getArchSuffix"></a>

### `electron-builder-core.getArchSuffix(arch)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-core](#module_electron-builder-core)</code>  

| Param | Type |
| --- | --- |
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-core.toLinuxArchString"></a>

### `electron-builder-core.toLinuxArchString(arch)` ⇒
**Kind**: method of <code>[electron-builder-core](#module_electron-builder-core)</code>  

| Param | Type |
| --- | --- |
| arch | <code>module:electron-builder-core.Arch</code> | 


-

<a name="module_electron-builder-http/out/CancellationToken"></a>

## electron-builder-http/out/CancellationToken

* [electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)
    * [.CancellationError](#module_electron-builder-http/out/CancellationToken.CancellationError) ⇐ <code>Error</code>
    * [.CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken) ⇐ <code>internal:EventEmitter</code>
        * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
        * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise</code>
        * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)


-

<a name="module_electron-builder-http/out/CancellationToken.CancellationError"></a>

### electron-builder-http/out/CancellationToken.CancellationError ⇐ <code>Error</code>
**Kind**: class of <code>[electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)</code>  
**Extends**: <code>Error</code>  

-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken"></a>

### electron-builder-http/out/CancellationToken.CancellationToken ⇐ <code>internal:EventEmitter</code>
**Kind**: class of <code>[electron-builder-http/out/CancellationToken](#module_electron-builder-http/out/CancellationToken)</code>  
**Extends**: <code>internal:EventEmitter</code>  

* [.CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken) ⇐ <code>internal:EventEmitter</code>
    * [`.cancel()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+cancel)
    * [`.createPromise(callback)`](#module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise) ⇒ <code>Promise</code>
    * [`.dispose()`](#module_electron-builder-http/out/CancellationToken.CancellationToken+dispose)


-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+cancel"></a>

#### `cancellationToken.cancel()`
**Kind**: instance method of <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code>  

-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+createPromise"></a>

#### `cancellationToken.createPromise(callback)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code>  

| Param | Type |
| --- | --- |
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http/out/CancellationToken.CancellationToken+dispose"></a>

#### `cancellationToken.dispose()`
**Kind**: instance method of <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code>  

-

<a name="module_electron-builder-http/out/ProgressCallbackTransform"></a>

## electron-builder-http/out/ProgressCallbackTransform

* [electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)
    * [`.ProgressInfo`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo)
    * [.ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
        * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
        * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo"></a>

### `electron-builder-http/out/ProgressCallbackTransform.ProgressInfo`
**Kind**: interface of <code>[electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **total**| <code>number</code> | 
| **delta**| <code>number</code> | 
| **transferred**| <code>number</code> | 
| **percent**| <code>number</code> | 
| **bytesPerSecond**| <code>number</code> | 


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform"></a>

### electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform ⇐ <code>internal:Transform</code>
**Kind**: class of <code>[electron-builder-http/out/ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform)</code>  
**Extends**: <code>internal:Transform</code>  

* [.ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform) ⇐ <code>internal:Transform</code>
    * [`._flush(callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush)
    * [`._transform(chunk, encoding, callback)`](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform)


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_flush"></a>

#### `progressCallbackTransform._flush(callback)`
**Kind**: instance method of <code>[ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform)</code>  

| Param | Type |
| --- | --- |
| callback | <code>function</code> | 


-

<a name="module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform+_transform"></a>

#### `progressCallbackTransform._transform(chunk, encoding, callback)`
**Kind**: instance method of <code>[ProgressCallbackTransform](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressCallbackTransform)</code>  

| Param | Type |
| --- | --- |
| chunk | <code>any</code> | 
| encoding | <code>string</code> | 
| callback | <code>function</code> | 


-

<a name="module_electron-builder-http/out/bintray"></a>

## electron-builder-http/out/bintray

* [electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)
    * [`.File`](#module_electron-builder-http/out/bintray.File)
    * [`.Version`](#module_electron-builder-http/out/bintray.Version)
    * [.BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)
        * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise</code>
        * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise</code>
        * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise</code>
        * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise</code>
    * [`.bintrayRequest(path, auth, data, cancellationToken, method)`](#module_electron-builder-http/out/bintray.bintrayRequest) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-http/out/bintray.File"></a>

### `electron-builder-http/out/bintray.File`
**Kind**: interface of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **path**| <code>string</code> | 
| **sha1**| <code>string</code> | 
| **sha256**| <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.Version"></a>

### `electron-builder-http/out/bintray.Version`
**Kind**: interface of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **name**| <code>string</code> | 
| **package**| <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient"></a>

### electron-builder-http/out/bintray.BintrayClient
**Kind**: class of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  

* [.BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)
    * [`.createVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+createVersion) ⇒ <code>Promise</code>
    * [`.deleteVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+deleteVersion) ⇒ <code>Promise</code>
    * [`.getVersion(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersion) ⇒ <code>Promise</code>
    * [`.getVersionFiles(version)`](#module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+createVersion"></a>

#### `bintrayClient.createVersion(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+deleteVersion"></a>

#### `bintrayClient.deleteVersion(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+getVersion"></a>

#### `bintrayClient.getVersion(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.BintrayClient+getVersionFiles"></a>

#### `bintrayClient.getVersionFiles(version)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayClient](#module_electron-builder-http/out/bintray.BintrayClient)</code>  

| Param | Type |
| --- | --- |
| version | <code>string</code> | 


-

<a name="module_electron-builder-http/out/bintray.bintrayRequest"></a>

### `electron-builder-http/out/bintray.bintrayRequest(path, auth, data, cancellationToken, method)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-http/out/bintray](#module_electron-builder-http/out/bintray)</code>  

| Param | Type |
| --- | --- |
| path | <code>string</code> | 
| auth | <code>string</code> &#124; <code>null</code> | 
| data | <code>module:electron-builder-http/out/bintray.__type</code> &#124; <code>null</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| method | <code>&quot;GET&quot;</code> &#124; <code>&quot;DELETE&quot;</code> &#124; <code>&quot;PUT&quot;</code> | 


-

<a name="module_electron-builder-http"></a>

## electron-builder-http

* [electron-builder-http](#module_electron-builder-http)
    * [`.DownloadOptions`](#module_electron-builder-http.DownloadOptions)
        * [`.onProgress(progress)`](#module_electron-builder-http.DownloadOptions+onProgress)
    * [`.RequestHeaders`](#module_electron-builder-http.RequestHeaders)
    * [`.Response`](#module_electron-builder-http.Response) ⇐ <code>internal:EventEmitter</code>
        * [`.setEncoding(encoding)`](#module_electron-builder-http.Response+setEncoding)
    * [.HttpError](#module_electron-builder-http.HttpError) ⇐ <code>Error</code>
    * [.HttpExecutor](#module_electron-builder-http.HttpExecutor)
        * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
    * [.HttpExecutorHolder](#module_electron-builder-http.HttpExecutorHolder)
    * [`.configureRequestOptions(options, token, method)`](#module_electron-builder-http.configureRequestOptions) ⇒ <code>module:http.RequestOptions</code>
    * [`.download(url, destination, options)`](#module_electron-builder-http.download) ⇒ <code>Promise</code>
    * [`.dumpRequestOptions(options)`](#module_electron-builder-http.dumpRequestOptions) ⇒ <code>string</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.request) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-http.DownloadOptions"></a>

### `electron-builder-http.DownloadOptions`
**Kind**: interface of <code>[electron-builder-http](#module_electron-builder-http)</code>  
**Properties**

| Name | Type |
| --- | --- |
| headers| <code>[RequestHeaders](#module_electron-builder-http.RequestHeaders)</code> &#124; <code>null</code> | 
| skipDirCreation| <code>boolean</code> | 
| sha2| <code>string</code> &#124; <code>null</code> | 
| **cancellationToken**| <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-builder-http.DownloadOptions+onProgress"></a>

#### `downloadOptions.onProgress(progress)`
**Kind**: instance method of <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code>  

| Param | Type |
| --- | --- |
| progress | <code>[ProgressInfo](#module_electron-builder-http/out/ProgressCallbackTransform.ProgressInfo)</code> | 


-

<a name="module_electron-builder-http.RequestHeaders"></a>

### `electron-builder-http.RequestHeaders`
**Kind**: interface of <code>[electron-builder-http](#module_electron-builder-http)</code>  

-

<a name="module_electron-builder-http.Response"></a>

### `electron-builder-http.Response` ⇐ <code>internal:EventEmitter</code>
**Kind**: interface of <code>[electron-builder-http](#module_electron-builder-http)</code>  
**Extends**: <code>internal:EventEmitter</code>  
**Properties**

| Name | Type |
| --- | --- |
| statusCode| <code>number</code> | 
| statusMessage| <code>string</code> | 
| **headers**| <code>any</code> | 


-

<a name="module_electron-builder-http.Response+setEncoding"></a>

#### `response.setEncoding(encoding)`
**Kind**: instance method of <code>[Response](#module_electron-builder-http.Response)</code>  

| Param | Type |
| --- | --- |
| encoding | <code>string</code> | 


-

<a name="module_electron-builder-http.HttpError"></a>

### electron-builder-http.HttpError ⇐ <code>Error</code>
**Kind**: class of <code>[electron-builder-http](#module_electron-builder-http)</code>  
**Extends**: <code>Error</code>  

-

<a name="module_electron-builder-http.HttpExecutor"></a>

### electron-builder-http.HttpExecutor
**Kind**: class of <code>[electron-builder-http](#module_electron-builder-http)</code>  

* [.HttpExecutor](#module_electron-builder-http.HttpExecutor)
    * [`.download(url, destination, options)`](#module_electron-builder-http.HttpExecutor+download) ⇒ <code>Promise</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
    * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-http.HttpExecutor+doApiRequest) ⇒ <code>Promise</code>
    * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
    * [`.doRequest(options, callback)`](#module_electron-builder-http.HttpExecutor+doRequest) ⇒ <code>any</code>
    * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)


-

<a name="module_electron-builder-http.HttpExecutor+download"></a>

#### `httpExecutor.download(url, destination, options)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+request"></a>

#### `httpExecutor.request(options, cancellationToken, data)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| data | <code>module:electron-builder-http.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+addTimeOutHandler"></a>

#### `httpExecutor.addTimeOutHandler(request, callback)`
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| request | <code>any</code> | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doApiRequest"></a>

#### `httpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>module:electron-builder-http.REQUEST_OPTS</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>number</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doDownload"></a>

#### `httpExecutor.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| requestOptions | <code>any</code> | 
| destination | <code>string</code> | 
| redirectCount | <code>number</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 
| callback | <code>callback</code> | 
| onCancel | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doRequest"></a>

#### `httpExecutor.doRequest(options, callback)` ⇒ <code>any</code>
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+handleResponse"></a>

#### `httpExecutor.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`
**Kind**: instance method of <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| response | <code>[Response](#module_electron-builder-http.Response)</code> | 
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| resolve | <code>callback</code> | 
| reject | <code>callback</code> | 
| redirectCount | <code>number</code> | 
| requestProcessor | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutorHolder"></a>

### electron-builder-http.HttpExecutorHolder
**Kind**: class of <code>[electron-builder-http](#module_electron-builder-http)</code>  

-

<a name="module_electron-builder-http.configureRequestOptions"></a>

### `electron-builder-http.configureRequestOptions(options, token, method)` ⇒ <code>module:http.RequestOptions</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| token | <code>string</code> &#124; <code>null</code> | 
| method | <code>&quot;GET&quot;</code> &#124; <code>&quot;DELETE&quot;</code> &#124; <code>&quot;PUT&quot;</code> | 


-

<a name="module_electron-builder-http.download"></a>

### `electron-builder-http.download(url, destination, options)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.dumpRequestOptions"></a>

### `electron-builder-http.dumpRequestOptions(options)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 


-

<a name="module_electron-builder-http.request"></a>

### `electron-builder-http.request(options, cancellationToken, data)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-http](#module_electron-builder-http)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| data | <code>module:electron-builder-http.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-publish/out/BintrayPublisher"></a>

## electron-publish/out/BintrayPublisher

* [electron-publish/out/BintrayPublisher](#module_electron-publish/out/BintrayPublisher)
    * [.BintrayPublisher](#module_electron-publish/out/BintrayPublisher.BintrayPublisher) ⇐ <code>module:electron-publish.HttpPublisher</code>
        * [`.deleteRelease()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease) ⇒ <code>Promise</code>
        * [`.toString()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString) ⇒ <code>string</code>
        * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+doUpload) ⇒ <code>Promise</code>


-

<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher"></a>

### electron-publish/out/BintrayPublisher.BintrayPublisher ⇐ <code>module:electron-publish.HttpPublisher</code>
**Kind**: class of <code>[electron-publish/out/BintrayPublisher](#module_electron-publish/out/BintrayPublisher)</code>  
**Extends**: <code>module:electron-publish.HttpPublisher</code>  

* [.BintrayPublisher](#module_electron-publish/out/BintrayPublisher.BintrayPublisher) ⇐ <code>module:electron-publish.HttpPublisher</code>
    * [`.deleteRelease()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease) ⇒ <code>Promise</code>
    * [`.toString()`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString) ⇒ <code>string</code>
    * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/BintrayPublisher.BintrayPublisher+doUpload) ⇒ <code>Promise</code>


-

<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+deleteRelease"></a>

#### `bintrayPublisher.deleteRelease()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayPublisher](#module_electron-publish/out/BintrayPublisher.BintrayPublisher)</code>  

-

<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+toString"></a>

#### `bintrayPublisher.toString()` ⇒ <code>string</code>
**Kind**: instance method of <code>[BintrayPublisher](#module_electron-publish/out/BintrayPublisher.BintrayPublisher)</code>  

-

<a name="module_electron-publish/out/BintrayPublisher.BintrayPublisher+doUpload"></a>

#### `bintrayPublisher.doUpload(fileName, dataLength, requestProcessor)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayPublisher](#module_electron-publish/out/BintrayPublisher.BintrayPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| dataLength | <code>number</code> | 
| requestProcessor | <code>callback</code> | 


-

<a name="module_electron-publish/out/gitHubPublisher"></a>

## electron-publish/out/gitHubPublisher

* [electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)
    * [`.Release`](#module_electron-publish/out/gitHubPublisher.Release)
    * [.GitHubPublisher](#module_electron-publish/out/gitHubPublisher.GitHubPublisher) ⇐ <code>module:electron-publish.HttpPublisher</code>
        * [`.deleteRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease) ⇒ <code>Promise</code>
        * [`.getRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease) ⇒ <code>Promise</code>
        * [`.toString()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString) ⇒ <code>string</code>
        * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+doUpload) ⇒ <code>Promise</code>


-

<a name="module_electron-publish/out/gitHubPublisher.Release"></a>

### `electron-publish/out/gitHubPublisher.Release`
**Kind**: interface of <code>[electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)</code>  
**Properties**

| Name | Type |
| --- | --- |
| **id**| <code>number</code> | 
| **tag_name**| <code>string</code> | 
| **draft**| <code>boolean</code> | 
| **prerelease**| <code>boolean</code> | 
| **published_at**| <code>string</code> | 
| **upload_url**| <code>string</code> | 


-

<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher"></a>

### electron-publish/out/gitHubPublisher.GitHubPublisher ⇐ <code>module:electron-publish.HttpPublisher</code>
**Kind**: class of <code>[electron-publish/out/gitHubPublisher](#module_electron-publish/out/gitHubPublisher)</code>  
**Extends**: <code>module:electron-publish.HttpPublisher</code>  

* [.GitHubPublisher](#module_electron-publish/out/gitHubPublisher.GitHubPublisher) ⇐ <code>module:electron-publish.HttpPublisher</code>
    * [`.deleteRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease) ⇒ <code>Promise</code>
    * [`.getRelease()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease) ⇒ <code>Promise</code>
    * [`.toString()`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString) ⇒ <code>string</code>
    * [`.doUpload(fileName, dataLength, requestProcessor)`](#module_electron-publish/out/gitHubPublisher.GitHubPublisher+doUpload) ⇒ <code>Promise</code>


-

<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+deleteRelease"></a>

#### `gitHubPublisher.deleteRelease()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GitHubPublisher](#module_electron-publish/out/gitHubPublisher.GitHubPublisher)</code>  

-

<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+getRelease"></a>

#### `gitHubPublisher.getRelease()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GitHubPublisher](#module_electron-publish/out/gitHubPublisher.GitHubPublisher)</code>  

-

<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+toString"></a>

#### `gitHubPublisher.toString()` ⇒ <code>string</code>
**Kind**: instance method of <code>[GitHubPublisher](#module_electron-publish/out/gitHubPublisher.GitHubPublisher)</code>  

-

<a name="module_electron-publish/out/gitHubPublisher.GitHubPublisher+doUpload"></a>

#### `gitHubPublisher.doUpload(fileName, dataLength, requestProcessor)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GitHubPublisher](#module_electron-publish/out/gitHubPublisher.GitHubPublisher)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| fileName | <code>string</code> | 
| dataLength | <code>number</code> | 
| requestProcessor | <code>callback</code> | 


-

<a name="module_electron-publish/out/multiProgress"></a>

## electron-publish/out/multiProgress

* [electron-publish/out/multiProgress](#module_electron-publish/out/multiProgress)
    * [.MultiProgress](#module_electron-publish/out/multiProgress.MultiProgress)
        * [`.createBar(format, options)`](#module_electron-publish/out/multiProgress.MultiProgress+createBar) ⇒ <code>any</code>
        * [`.terminate()`](#module_electron-publish/out/multiProgress.MultiProgress+terminate)


-

<a name="module_electron-publish/out/multiProgress.MultiProgress"></a>

### electron-publish/out/multiProgress.MultiProgress
**Kind**: class of <code>[electron-publish/out/multiProgress](#module_electron-publish/out/multiProgress)</code>  

* [.MultiProgress](#module_electron-publish/out/multiProgress.MultiProgress)
    * [`.createBar(format, options)`](#module_electron-publish/out/multiProgress.MultiProgress+createBar) ⇒ <code>any</code>
    * [`.terminate()`](#module_electron-publish/out/multiProgress.MultiProgress+terminate)


-

<a name="module_electron-publish/out/multiProgress.MultiProgress+createBar"></a>

#### `multiProgress.createBar(format, options)` ⇒ <code>any</code>
**Kind**: instance method of <code>[MultiProgress](#module_electron-publish/out/multiProgress.MultiProgress)</code>  

| Param | Type |
| --- | --- |
| format | <code>string</code> | 
| options | <code>any</code> | 


-

<a name="module_electron-publish/out/multiProgress.MultiProgress+terminate"></a>

#### `multiProgress.terminate()`
**Kind**: instance method of <code>[MultiProgress](#module_electron-publish/out/multiProgress.MultiProgress)</code>  

-

<a name="module_electron-updater/out/BintrayProvider"></a>

## electron-updater/out/BintrayProvider

* [electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)
    * [.BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider"></a>

### electron-updater/out/BintrayProvider.BintrayProvider ⇐ <code>module:electron-updater/out/api.Provider</code>
**Kind**: class of <code>[electron-updater/out/BintrayProvider](#module_electron-updater/out/BintrayProvider)</code>  
**Extends**: <code>module:electron-updater/out/api.Provider</code>  

* [.BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion) ⇒ <code>Promise</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getLatestVersion"></a>

#### `bintrayProvider.getLatestVersion()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider)</code>  

-

<a name="module_electron-updater/out/BintrayProvider.BintrayProvider+getUpdateFile"></a>

#### `bintrayProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[BintrayProvider](#module_electron-updater/out/BintrayProvider.BintrayProvider)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-builder-http/out/publishOptions.VersionInfo</code> | 


-

<a name="module_electron-updater/out/GenericProvider"></a>

## electron-updater/out/GenericProvider

* [electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)
    * [.GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise</code>
    * [`.validateUpdateInfo(info)`](#module_electron-updater/out/GenericProvider.validateUpdateInfo)


-

<a name="module_electron-updater/out/GenericProvider.GenericProvider"></a>

### electron-updater/out/GenericProvider.GenericProvider ⇐ <code>module:electron-updater/out/api.Provider</code>
**Kind**: class of <code>[electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)</code>  
**Extends**: <code>module:electron-updater/out/api.Provider</code>  

* [.GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion) ⇒ <code>Promise</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/GenericProvider.GenericProvider+getLatestVersion"></a>

#### `genericProvider.getLatestVersion()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider)</code>  

-

<a name="module_electron-updater/out/GenericProvider.GenericProvider+getUpdateFile"></a>

#### `genericProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GenericProvider](#module_electron-updater/out/GenericProvider.GenericProvider)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-builder-http/out/publishOptions.UpdateInfo</code> | 


-

<a name="module_electron-updater/out/GenericProvider.validateUpdateInfo"></a>

### `electron-updater/out/GenericProvider.validateUpdateInfo(info)`
**Kind**: method of <code>[electron-updater/out/GenericProvider](#module_electron-updater/out/GenericProvider)</code>  

| Param | Type |
| --- | --- |
| info | <code>module:electron-builder-http/out/publishOptions.UpdateInfo</code> | 


-

<a name="module_electron-updater/out/GitHubProvider"></a>

## electron-updater/out/GitHubProvider

* [electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)
    * [.GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
        * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise</code>
        * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider"></a>

### electron-updater/out/GitHubProvider.GitHubProvider ⇐ <code>module:electron-updater/out/api.Provider</code>
**Kind**: class of <code>[electron-updater/out/GitHubProvider](#module_electron-updater/out/GitHubProvider)</code>  
**Extends**: <code>module:electron-updater/out/api.Provider</code>  

* [.GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider) ⇐ <code>module:electron-updater/out/api.Provider</code>
    * [`.getLatestVersion()`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion) ⇒ <code>Promise</code>
    * [`.getUpdateFile(versionInfo)`](#module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getLatestVersion"></a>

#### `gitHubProvider.getLatestVersion()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider)</code>  

-

<a name="module_electron-updater/out/GitHubProvider.GitHubProvider+getUpdateFile"></a>

#### `gitHubProvider.getUpdateFile(versionInfo)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[GitHubProvider](#module_electron-updater/out/GitHubProvider.GitHubProvider)</code>  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-builder-http/out/publishOptions.UpdateInfo</code> | 


-

<a name="module_electron-updater/out/MacUpdater"></a>

## electron-updater/out/MacUpdater

* [electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)
    * [.MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater) ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird</code>
        * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable)


-

<a name="module_electron-updater/out/MacUpdater.MacUpdater"></a>

### electron-updater/out/MacUpdater.MacUpdater ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
**Kind**: class of <code>[electron-updater/out/MacUpdater](#module_electron-updater/out/MacUpdater)</code>  
**Extends**: <code>module:electron-updater/out/AppUpdater.AppUpdater</code>  

* [.MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater) ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.onUpdateAvailable(versionInfo, fileInfo)`](#module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable)


-

<a name="module_electron-updater/out/MacUpdater.MacUpdater+quitAndInstall"></a>

#### `macUpdater.quitAndInstall()`
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  

-

<a name="module_electron-updater/out/MacUpdater.MacUpdater+doDownloadUpdate"></a>

#### `macUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>module:bluebird-lst.Bluebird</code>
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-builder-http/out/publishOptions.VersionInfo</code> | 
| fileInfo | <code>module:electron-updater/out/api.FileInfo</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/MacUpdater.MacUpdater+onUpdateAvailable"></a>

#### `macUpdater.onUpdateAvailable(versionInfo, fileInfo)`
**Kind**: instance method of <code>[MacUpdater](#module_electron-updater/out/MacUpdater.MacUpdater)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-builder-http/out/publishOptions.VersionInfo</code> | 
| fileInfo | <code>module:electron-updater/out/api.FileInfo</code> | 


-

<a name="module_electron-updater/out/NsisUpdater"></a>

## electron-updater/out/NsisUpdater

* [electron-updater/out/NsisUpdater](#module_electron-updater/out/NsisUpdater)
    * [.NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater) ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
        * [`.quitAndInstall()`](#module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall)
        * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/NsisUpdater.NsisUpdater"></a>

### electron-updater/out/NsisUpdater.NsisUpdater ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
**Kind**: class of <code>[electron-updater/out/NsisUpdater](#module_electron-updater/out/NsisUpdater)</code>  
**Extends**: <code>module:electron-updater/out/AppUpdater.AppUpdater</code>  

* [.NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater) ⇐ <code>module:electron-updater/out/AppUpdater.AppUpdater</code>
    * [`.quitAndInstall()`](#module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall)
    * [`.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)`](#module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate) ⇒ <code>Promise</code>


-

<a name="module_electron-updater/out/NsisUpdater.NsisUpdater+quitAndInstall"></a>

#### `nsisUpdater.quitAndInstall()`
**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  

-

<a name="module_electron-updater/out/NsisUpdater.NsisUpdater+doDownloadUpdate"></a>

#### `nsisUpdater.doDownloadUpdate(versionInfo, fileInfo, cancellationToken)` ⇒ <code>Promise</code>
Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.

**Kind**: instance method of <code>[NsisUpdater](#module_electron-updater/out/NsisUpdater.NsisUpdater)</code>  
**Returns**: <code>Promise</code> - Path to downloaded file.  
**Access**: protected  

| Param | Type |
| --- | --- |
| versionInfo | <code>module:electron-builder-http/out/publishOptions.VersionInfo</code> | 
| fileInfo | <code>module:electron-updater/out/api.FileInfo</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 


-

<a name="module_electron-updater/out/electronHttpExecutor"></a>

## electron-updater/out/electronHttpExecutor

* [electron-updater/out/electronHttpExecutor](#module_electron-updater/out/electronHttpExecutor)
    * [.ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise</code>
        * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor"></a>

### electron-updater/out/electronHttpExecutor.ElectronHttpExecutor ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
**Kind**: class of <code>[electron-updater/out/electronHttpExecutor](#module_electron-updater/out/electronHttpExecutor)</code>  
**Extends**: <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  

* [.ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
    * [`.download(url, destination, options)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download) ⇒ <code>Promise</code>
    * [`.doRequest(options, callback)`](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest) ⇒ <code>any</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
    * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
    * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
    * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doApiRequest"></a>

#### `electronHttpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Overrides**: <code>[doApiRequest](#module_electron-builder-http.HttpExecutor+doApiRequest)</code>  

| Param | Type |
| --- | --- |
| options | <code>Electron:RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>number</code> | 


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+download"></a>

#### `electronHttpExecutor.download(url, destination, options)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Overrides**: <code>[download](#module_electron-builder-http.HttpExecutor+download)</code>  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 


-

<a name="module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor+doRequest"></a>

#### `electronHttpExecutor.doRequest(options, callback)` ⇒ <code>any</code>
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Overrides**: <code>[doRequest](#module_electron-builder-http.HttpExecutor+doRequest)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+request"></a>

#### `electronHttpExecutor.request(options, cancellationToken, data)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| data | <code>module:electron-builder-http.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+addTimeOutHandler"></a>

#### `electronHttpExecutor.addTimeOutHandler(request, callback)`
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| request | <code>any</code> | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doDownload"></a>

#### `electronHttpExecutor.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| requestOptions | <code>any</code> | 
| destination | <code>string</code> | 
| redirectCount | <code>number</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 
| callback | <code>callback</code> | 
| onCancel | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+handleResponse"></a>

#### `electronHttpExecutor.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`
**Kind**: instance method of <code>[ElectronHttpExecutor](#module_electron-updater/out/electronHttpExecutor.ElectronHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| response | <code>[Response](#module_electron-builder-http.Response)</code> | 
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| resolve | <code>callback</code> | 
| reject | <code>callback</code> | 
| redirectCount | <code>number</code> | 
| requestProcessor | <code>callback</code> | 


-

<a name="module_electron-builder-util/out/binDownload"></a>

## electron-builder-util/out/binDownload

* [electron-builder-util/out/binDownload](#module_electron-builder-util/out/binDownload)
    * [`.getBin(name, dirName, url, sha2)`](#module_electron-builder-util/out/binDownload.getBin) ⇒ <code>Promise</code>
    * [`.getBinFromBintray(name, version, sha2)`](#module_electron-builder-util/out/binDownload.getBinFromBintray) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-util/out/binDownload.getBin"></a>

### `electron-builder-util/out/binDownload.getBin(name, dirName, url, sha2)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util/out/binDownload](#module_electron-builder-util/out/binDownload)</code>  

| Param | Type |
| --- | --- |
| name | <code>string</code> | 
| dirName | <code>string</code> | 
| url | <code>string</code> | 
| sha2 | <code>string</code> | 


-

<a name="module_electron-builder-util/out/binDownload.getBinFromBintray"></a>

### `electron-builder-util/out/binDownload.getBinFromBintray(name, version, sha2)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util/out/binDownload](#module_electron-builder-util/out/binDownload)</code>  

| Param | Type |
| --- | --- |
| name | <code>string</code> | 
| version | <code>string</code> | 
| sha2 | <code>string</code> | 


-

<a name="module_electron-builder-util/out/deepAssign"></a>

## electron-builder-util/out/deepAssign

-

<a name="module_electron-builder-util/out/deepAssign.deepAssign"></a>

### `electron-builder-util/out/deepAssign.deepAssign(target, objects)` ⇒ <code>any</code>
**Kind**: method of <code>[electron-builder-util/out/deepAssign](#module_electron-builder-util/out/deepAssign)</code>  

| Param | Type |
| --- | --- |
| target | <code>any</code> | 
| objects | <code>Array</code> | 


-

<a name="module_electron-builder-util/out/fs"></a>

## electron-builder-util/out/fs

* [electron-builder-util/out/fs](#module_electron-builder-util/out/fs)
    * [.FileCopier](#module_electron-builder-util/out/fs.FileCopier)
        * [`.copy(src, dest, stat)`](#module_electron-builder-util/out/fs.FileCopier+copy) ⇒ <code>Promise</code>
    * [`.copyDir(src, destination, filter, isUseHardLink)`](#module_electron-builder-util/out/fs.copyDir) ⇒ <code>Promise</code>
    * [`.copyFile(src, dest, stats, isUseHardLink)`](#module_electron-builder-util/out/fs.copyFile) ⇒ <code>Promise</code>
    * [`.exists(file)`](#module_electron-builder-util/out/fs.exists) ⇒ <code>Promise</code>
    * [`.statOrNull(file)`](#module_electron-builder-util/out/fs.statOrNull) ⇒ <code>Promise</code>
    * [`.unlinkIfExists(file)`](#module_electron-builder-util/out/fs.unlinkIfExists) ⇒ <code>Promise</code>
    * [`.walk(initialDirPath, filter, consumer)`](#module_electron-builder-util/out/fs.walk) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-util/out/fs.FileCopier"></a>

### electron-builder-util/out/fs.FileCopier
**Kind**: class of <code>[electron-builder-util/out/fs](#module_electron-builder-util/out/fs)</code>  

-

<a name="module_electron-builder-util/out/fs.FileCopier+copy"></a>

#### `fileCopier.copy(src, dest, stat)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[FileCopier](#module_electron-builder-util/out/fs.FileCopier)</code>  

| Param | Type |
| --- | --- |
| src | <code>string</code> | 
| dest | <code>string</code> | 
| stat | <code>module:fs.Stats</code> &#124; <code>undefined</code> | 


-

<a name="module_electron-builder-util/out/fs.copyDir"></a>

### `electron-builder-util/out/fs.copyDir(src, destination, filter, isUseHardLink)` ⇒ <code>Promise</code>
Empty directories is never created.
Hard links is used if supported and allowed.

**Kind**: method of <code>[electron-builder-util/out/fs](#module_electron-builder-util/out/fs)</code>  

| Param | Type |
| --- | --- |
| src | <code>string</code> | 
| destination | <code>string</code> | 
| filter | <code>module:electron-builder-util/out/fs.__type</code> | 
| isUseHardLink | <code>callback</code> | 


-

<a name="module_electron-builder-util/out/fs.copyFile"></a>

### `electron-builder-util/out/fs.copyFile(src, dest, stats, isUseHardLink)` ⇒ <code>Promise</code>
Hard links is used if supported and allowed.
File permission is fixed — allow execute for all if owner can, allow read for all if owner can.

**Kind**: method of <code>[electron-builder-util/out/fs](#module_electron-builder-util/out/fs)</code>  

| Param | Type |
| --- | --- |
| src | <code>string</code> | 
| dest | <code>string</code> | 
| stats | <code>module:fs.Stats</code> &#124; <code>null</code> | 
| isUseHardLink |  | 


-

<a name="module_electron-builder-util/out/fs.exists"></a>

### `electron-builder-util/out/fs.exists(file)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util/out/fs](#module_electron-builder-util/out/fs)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 


-

<a name="module_electron-builder-util/out/fs.statOrNull"></a>

### `electron-builder-util/out/fs.statOrNull(file)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util/out/fs](#module_electron-builder-util/out/fs)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 


-

<a name="module_electron-builder-util/out/fs.unlinkIfExists"></a>

### `electron-builder-util/out/fs.unlinkIfExists(file)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util/out/fs](#module_electron-builder-util/out/fs)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 


-

<a name="module_electron-builder-util/out/fs.walk"></a>

### `electron-builder-util/out/fs.walk(initialDirPath, filter, consumer)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util/out/fs](#module_electron-builder-util/out/fs)</code>  

| Param | Type |
| --- | --- |
| initialDirPath | <code>string</code> | 
| filter | <code>module:electron-builder-util/out/fs.__type</code> &#124; <code>null</code> | 
| consumer | <code>callback</code> | 


-

<a name="module_electron-builder-util/out/log"></a>

## electron-builder-util/out/log

* [electron-builder-util/out/log](#module_electron-builder-util/out/log)
    * [`.log(message)`](#module_electron-builder-util/out/log.log)
    * [`.setPrinter(value)`](#module_electron-builder-util/out/log.setPrinter)
    * [`.subTask(title, promise)`](#module_electron-builder-util/out/log.subTask) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.task(title, promise)`](#module_electron-builder-util/out/log.task) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.warn(message)`](#module_electron-builder-util/out/log.warn)


-

<a name="module_electron-builder-util/out/log.log"></a>

### `electron-builder-util/out/log.log(message)`
**Kind**: method of <code>[electron-builder-util/out/log](#module_electron-builder-util/out/log)</code>  

| Param | Type |
| --- | --- |
| message | <code>string</code> | 


-

<a name="module_electron-builder-util/out/log.setPrinter"></a>

### `electron-builder-util/out/log.setPrinter(value)`
**Kind**: method of <code>[electron-builder-util/out/log](#module_electron-builder-util/out/log)</code>  

| Param | Type |
| --- | --- |
| value | <code>module:electron-builder-util/out/log.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-util/out/log.subTask"></a>

### `electron-builder-util/out/log.subTask(title, promise)` ⇒ <code>module:bluebird-lst.Bluebird</code>
**Kind**: method of <code>[electron-builder-util/out/log](#module_electron-builder-util/out/log)</code>  

| Param | Type |
| --- | --- |
| title | <code>string</code> | 
| promise | <code>module:bluebird-lst.Bluebird</code> &#124; <code>Promise</code> | 


-

<a name="module_electron-builder-util/out/log.task"></a>

### `electron-builder-util/out/log.task(title, promise)` ⇒ <code>module:bluebird-lst.Bluebird</code>
**Kind**: method of <code>[electron-builder-util/out/log](#module_electron-builder-util/out/log)</code>  

| Param | Type |
| --- | --- |
| title | <code>string</code> | 
| promise | <code>module:bluebird-lst.Bluebird</code> &#124; <code>Promise</code> | 


-

<a name="module_electron-builder-util/out/log.warn"></a>

### `electron-builder-util/out/log.warn(message)`
**Kind**: method of <code>[electron-builder-util/out/log](#module_electron-builder-util/out/log)</code>  

| Param | Type |
| --- | --- |
| message | <code>string</code> | 


-

<a name="module_electron-builder-util/out/nodeHttpExecutor"></a>

## electron-builder-util/out/nodeHttpExecutor

* [electron-builder-util/out/nodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor)
    * [.NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
        * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
        * [`.download(url, destination, options)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+download) ⇒ <code>Promise</code>
        * [`.doRequest(options, callback)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doRequest) ⇒ <code>any</code>
        * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
        * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
        * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
        * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)
    * [`.httpExecutor`](#module_electron-builder-util/out/nodeHttpExecutor.httpExecutor) : <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>


-

<a name="module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor"></a>

### electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
**Kind**: class of <code>[electron-builder-util/out/nodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor)</code>  
**Extends**: <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>  

* [.NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor) ⇐ <code>[HttpExecutor](#module_electron-builder-http.HttpExecutor)</code>
    * [`.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doApiRequest) ⇒ <code>Promise</code>
    * [`.download(url, destination, options)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+download) ⇒ <code>Promise</code>
    * [`.doRequest(options, callback)`](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doRequest) ⇒ <code>any</code>
    * [`.request(options, cancellationToken, data)`](#module_electron-builder-http.HttpExecutor+request) ⇒ <code>Promise</code>
    * [`.addTimeOutHandler(request, callback)`](#module_electron-builder-http.HttpExecutor+addTimeOutHandler)
    * [`.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`](#module_electron-builder-http.HttpExecutor+doDownload)
    * [`.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`](#module_electron-builder-http.HttpExecutor+handleResponse)


-

<a name="module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doApiRequest"></a>

#### `nodeHttpExecutor.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>  
**Overrides**: <code>[doApiRequest](#module_electron-builder-http.HttpExecutor+doApiRequest)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:https.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| requestProcessor | <code>callback</code> | 
| redirectCount | <code>number</code> | 


-

<a name="module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+download"></a>

#### `nodeHttpExecutor.download(url, destination, options)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>  
**Overrides**: <code>[download](#module_electron-builder-http.HttpExecutor+download)</code>  

| Param | Type |
| --- | --- |
| url | <code>string</code> | 
| destination | <code>string</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 


-

<a name="module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor+doRequest"></a>

#### `nodeHttpExecutor.doRequest(options, callback)` ⇒ <code>any</code>
**Kind**: instance method of <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>  
**Overrides**: <code>[doRequest](#module_electron-builder-http.HttpExecutor+doRequest)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| options | <code>any</code> | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+request"></a>

#### `nodeHttpExecutor.request(options, cancellationToken, data)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>  

| Param | Type |
| --- | --- |
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| data | <code>module:electron-builder-http.__type</code> &#124; <code>null</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+addTimeOutHandler"></a>

#### `nodeHttpExecutor.addTimeOutHandler(request, callback)`
**Kind**: instance method of <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| request | <code>any</code> | 
| callback | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+doDownload"></a>

#### `nodeHttpExecutor.doDownload(requestOptions, destination, redirectCount, options, callback, onCancel)`
**Kind**: instance method of <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| requestOptions | <code>any</code> | 
| destination | <code>string</code> | 
| redirectCount | <code>number</code> | 
| options | <code>[DownloadOptions](#module_electron-builder-http.DownloadOptions)</code> | 
| callback | <code>callback</code> | 
| onCancel | <code>callback</code> | 


-

<a name="module_electron-builder-http.HttpExecutor+handleResponse"></a>

#### `nodeHttpExecutor.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)`
**Kind**: instance method of <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>  
**Access**: protected  

| Param | Type |
| --- | --- |
| response | <code>[Response](#module_electron-builder-http.Response)</code> | 
| options | <code>module:http.RequestOptions</code> | 
| cancellationToken | <code>[CancellationToken](#module_electron-builder-http/out/CancellationToken.CancellationToken)</code> | 
| resolve | <code>callback</code> | 
| reject | <code>callback</code> | 
| redirectCount | <code>number</code> | 
| requestProcessor | <code>callback</code> | 


-

<a name="module_electron-builder-util/out/nodeHttpExecutor.httpExecutor"></a>

### `electron-builder-util/out/nodeHttpExecutor.httpExecutor` : <code>[NodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor.NodeHttpExecutor)</code>
**Kind**: constant of <code>[electron-builder-util/out/nodeHttpExecutor](#module_electron-builder-util/out/nodeHttpExecutor)</code>  

-

<a name="module_electron-builder-util/out/promise"></a>

## electron-builder-util/out/promise

* [electron-builder-util/out/promise](#module_electron-builder-util/out/promise)
    * [.NestedError](#module_electron-builder-util/out/promise.NestedError) ⇐ <code>Error</code>
    * [`.all(promises)`](#module_electron-builder-util/out/promise.all) ⇒ <code>module:bluebird-lst.Bluebird</code>
    * [`.executeFinally(promise, task)`](#module_electron-builder-util/out/promise.executeFinally) ⇒ <code>Promise</code>
    * [`.printErrorAndExit(error)`](#module_electron-builder-util/out/promise.printErrorAndExit)
    * [`.throwError(errors)`](#module_electron-builder-util/out/promise.throwError)


-

<a name="module_electron-builder-util/out/promise.NestedError"></a>

### electron-builder-util/out/promise.NestedError ⇐ <code>Error</code>
**Kind**: class of <code>[electron-builder-util/out/promise](#module_electron-builder-util/out/promise)</code>  
**Extends**: <code>Error</code>  

-

<a name="module_electron-builder-util/out/promise.all"></a>

### `electron-builder-util/out/promise.all(promises)` ⇒ <code>module:bluebird-lst.Bluebird</code>
**Kind**: method of <code>[electron-builder-util/out/promise](#module_electron-builder-util/out/promise)</code>  

| Param | Type |
| --- | --- |
| promises | <code>Array</code> | 


-

<a name="module_electron-builder-util/out/promise.executeFinally"></a>

### `electron-builder-util/out/promise.executeFinally(promise, task)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util/out/promise](#module_electron-builder-util/out/promise)</code>  

| Param | Type |
| --- | --- |
| promise | <code>Promise</code> | 
| task | <code>callback</code> | 


-

<a name="module_electron-builder-util/out/promise.printErrorAndExit"></a>

### `electron-builder-util/out/promise.printErrorAndExit(error)`
**Kind**: method of <code>[electron-builder-util/out/promise](#module_electron-builder-util/out/promise)</code>  

| Param | Type |
| --- | --- |
| error | <code>Error</code> | 


-

<a name="module_electron-builder-util/out/promise.throwError"></a>

### `electron-builder-util/out/promise.throwError(errors)`
**Kind**: method of <code>[electron-builder-util/out/promise](#module_electron-builder-util/out/promise)</code>  

| Param | Type |
| --- | --- |
| errors | <code>Array</code> | 


-

<a name="module_electron-builder-util/out/tmp"></a>

## electron-builder-util/out/tmp

* [electron-builder-util/out/tmp](#module_electron-builder-util/out/tmp)
    * [.TmpDir](#module_electron-builder-util/out/tmp.TmpDir)
        * [`.cleanup()`](#module_electron-builder-util/out/tmp.TmpDir+cleanup) ⇒ <code>Promise</code>
        * [`.getTempFile(suffix)`](#module_electron-builder-util/out/tmp.TmpDir+getTempFile) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-util/out/tmp.TmpDir"></a>

### electron-builder-util/out/tmp.TmpDir
**Kind**: class of <code>[electron-builder-util/out/tmp](#module_electron-builder-util/out/tmp)</code>  

* [.TmpDir](#module_electron-builder-util/out/tmp.TmpDir)
    * [`.cleanup()`](#module_electron-builder-util/out/tmp.TmpDir+cleanup) ⇒ <code>Promise</code>
    * [`.getTempFile(suffix)`](#module_electron-builder-util/out/tmp.TmpDir+getTempFile) ⇒ <code>Promise</code>


-

<a name="module_electron-builder-util/out/tmp.TmpDir+cleanup"></a>

#### `tmpDir.cleanup()` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[TmpDir](#module_electron-builder-util/out/tmp.TmpDir)</code>  

-

<a name="module_electron-builder-util/out/tmp.TmpDir+getTempFile"></a>

#### `tmpDir.getTempFile(suffix)` ⇒ <code>Promise</code>
**Kind**: instance method of <code>[TmpDir](#module_electron-builder-util/out/tmp.TmpDir)</code>  

| Param | Type |
| --- | --- |
| suffix | <code>string</code> | 


-

<a name="module_electron-builder-util"></a>

## electron-builder-util

* [electron-builder-util](#module_electron-builder-util)
    * [`.BaseExecOptions`](#module_electron-builder-util.BaseExecOptions)
    * [`.ExecOptions`](#module_electron-builder-util.ExecOptions) ⇐ <code>[BaseExecOptions](#module_electron-builder-util.BaseExecOptions)</code>
    * [.Lazy](#module_electron-builder-util.Lazy)
    * [`.addValue(map, key, value)`](#module_electron-builder-util.addValue)
    * [`.asArray(v)`](#module_electron-builder-util.asArray) ⇒ <code>Array</code>
    * [`.computeDefaultAppDirectory(projectDir, userAppDir)`](#module_electron-builder-util.computeDefaultAppDirectory) ⇒ <code>Promise</code>
    * [`.debug7zArgs(command)`](#module_electron-builder-util.debug7zArgs) ⇒ <code>Array</code>
    * [`.doSpawn(command, args, options, pipeInput)`](#module_electron-builder-util.doSpawn) ⇒ <code>module:child_process.ChildProcess</code>
    * [`.exec(file, args, options)`](#module_electron-builder-util.exec) ⇒ <code>Promise</code>
    * [`.execWine(file, args, options)`](#module_electron-builder-util.execWine) ⇒ <code>Promise</code>
    * [`.getCacheDirectory()`](#module_electron-builder-util.getCacheDirectory) ⇒ <code>string</code>
    * [`.getPlatformIconFileName(value, isMac)`](#module_electron-builder-util.getPlatformIconFileName) ⇒
    * [`.getTempName(prefix)`](#module_electron-builder-util.getTempName) ⇒ <code>string</code>
    * [`.handleProcess(event, childProcess, command, resolve, reject)`](#module_electron-builder-util.handleProcess)
    * [`.isEmptyOrSpaces(s)`](#module_electron-builder-util.isEmptyOrSpaces) ⇒ <code>boolean</code>
    * [`.prepareArgs(args, exePath)`](#module_electron-builder-util.prepareArgs) ⇒ <code>Array</code>
    * [`.removePassword(input)`](#module_electron-builder-util.removePassword) ⇒ <code>string</code>
    * [`.replaceDefault(inList, defaultList)`](#module_electron-builder-util.replaceDefault) ⇒ <code>Array</code>
    * [`.smarten(s)`](#module_electron-builder-util.smarten) ⇒ <code>string</code>
    * [`.spawn(command, args, options)`](#module_electron-builder-util.spawn) ⇒ <code>Promise</code>
    * [`.use(value, task)`](#module_electron-builder-util.use) ⇒


-

<a name="module_electron-builder-util.BaseExecOptions"></a>

### `electron-builder-util.BaseExecOptions`
**Kind**: interface of <code>[electron-builder-util](#module_electron-builder-util)</code>  
**Properties**

| Name | Type |
| --- | --- |
| cwd| <code>string</code> | 
| env| <code>any</code> | 
| stdio| <code>any</code> | 


-

<a name="module_electron-builder-util.ExecOptions"></a>

### `electron-builder-util.ExecOptions` ⇐ <code>[BaseExecOptions](#module_electron-builder-util.BaseExecOptions)</code>
**Kind**: interface of <code>[electron-builder-util](#module_electron-builder-util)</code>  
**Extends**: <code>[BaseExecOptions](#module_electron-builder-util.BaseExecOptions)</code>  
**Properties**

| Name | Type |
| --- | --- |
| customFds| <code>any</code> | 
| encoding| <code>string</code> | 
| timeout| <code>number</code> | 
| maxBuffer| <code>number</code> | 
| killSignal| <code>string</code> | 


-

<a name="module_electron-builder-util.Lazy"></a>

### electron-builder-util.Lazy
**Kind**: class of <code>[electron-builder-util](#module_electron-builder-util)</code>  

-

<a name="module_electron-builder-util.addValue"></a>

### `electron-builder-util.addValue(map, key, value)`
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| map | <code>Map</code> | 
| key | <code>module:electron-builder-util.K</code> | 
| value | <code>module:electron-builder-util.T</code> | 


-

<a name="module_electron-builder-util.asArray"></a>

### `electron-builder-util.asArray(v)` ⇒ <code>Array</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| v | <code>null</code> &#124; <code>undefined</code> &#124; <code>module:electron-builder-util.T</code> &#124; <code>Array</code> | 


-

<a name="module_electron-builder-util.computeDefaultAppDirectory"></a>

### `electron-builder-util.computeDefaultAppDirectory(projectDir, userAppDir)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| projectDir | <code>string</code> | 
| userAppDir | <code>string</code> &#124; <code>null</code> &#124; <code>undefined</code> | 


-

<a name="module_electron-builder-util.debug7zArgs"></a>

### `electron-builder-util.debug7zArgs(command)` ⇒ <code>Array</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| command | <code>&quot;a&quot;</code> &#124; <code>&quot;x&quot;</code> | 


-

<a name="module_electron-builder-util.doSpawn"></a>

### `electron-builder-util.doSpawn(command, args, options, pipeInput)` ⇒ <code>module:child_process.ChildProcess</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| command | <code>string</code> | 
| args | <code>Array</code> | 
| options | <code>module:child_process.SpawnOptions</code> | 
| pipeInput | <code>Boolean</code> | 


-

<a name="module_electron-builder-util.exec"></a>

### `electron-builder-util.exec(file, args, options)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| args | <code>Array</code> &#124; <code>null</code> | 
| options | <code>[ExecOptions](#module_electron-builder-util.ExecOptions)</code> | 


-

<a name="module_electron-builder-util.execWine"></a>

### `electron-builder-util.execWine(file, args, options)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| file | <code>string</code> | 
| args | <code>Array</code> | 
| options | <code>[ExecOptions](#module_electron-builder-util.ExecOptions)</code> | 


-

<a name="module_electron-builder-util.getCacheDirectory"></a>

### `electron-builder-util.getCacheDirectory()` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

-

<a name="module_electron-builder-util.getPlatformIconFileName"></a>

### `electron-builder-util.getPlatformIconFileName(value, isMac)` ⇒
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| value | <code>string</code> &#124; <code>null</code> &#124; <code>undefined</code> | 
| isMac | <code>boolean</code> | 


-

<a name="module_electron-builder-util.getTempName"></a>

### `electron-builder-util.getTempName(prefix)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| prefix | <code>string</code> &#124; <code>null</code> &#124; <code>undefined</code> | 


-

<a name="module_electron-builder-util.handleProcess"></a>

### `electron-builder-util.handleProcess(event, childProcess, command, resolve, reject)`
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| event | <code>string</code> | 
| childProcess | <code>module:child_process.ChildProcess</code> | 
| command | <code>string</code> | 
| resolve | <code>module:electron-builder-util.__type</code> &#124; <code>null</code> | 
| reject | <code>callback</code> | 


-

<a name="module_electron-builder-util.isEmptyOrSpaces"></a>

### `electron-builder-util.isEmptyOrSpaces(s)` ⇒ <code>boolean</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| s | <code>string</code> &#124; <code>null</code> &#124; <code>undefined</code> | 


-

<a name="module_electron-builder-util.prepareArgs"></a>

### `electron-builder-util.prepareArgs(args, exePath)` ⇒ <code>Array</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| args | <code>Array</code> | 
| exePath | <code>string</code> | 


-

<a name="module_electron-builder-util.removePassword"></a>

### `electron-builder-util.removePassword(input)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| input | <code>string</code> | 


-

<a name="module_electron-builder-util.replaceDefault"></a>

### `electron-builder-util.replaceDefault(inList, defaultList)` ⇒ <code>Array</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| inList | <code>Array</code> &#124; <code>null</code> &#124; <code>undefined</code> | 
| defaultList | <code>Array</code> | 


-

<a name="module_electron-builder-util.smarten"></a>

### `electron-builder-util.smarten(s)` ⇒ <code>string</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| s | <code>string</code> | 


-

<a name="module_electron-builder-util.spawn"></a>

### `electron-builder-util.spawn(command, args, options)` ⇒ <code>Promise</code>
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| command | <code>string</code> | 
| args | <code>Array</code> &#124; <code>null</code> | 
| options | <code>module:child_process.SpawnOptions</code> | 


-

<a name="module_electron-builder-util.use"></a>

### `electron-builder-util.use(value, task)` ⇒
**Kind**: method of <code>[electron-builder-util](#module_electron-builder-util)</code>  

| Param | Type |
| --- | --- |
| value | <code>module:electron-builder-util.T</code> &#124; <code>null</code> | 
| task | <code>callback</code> | 


-

