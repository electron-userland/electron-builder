import { InvalidConfigurationError, executeFinally, log } from "builder-util"
import { asArray } from "builder-util-runtime"
import { PublishOptions } from "electron-publish"
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> c92b22265 (tmp save for .js extension migration)
import { Packager } from "./packager.js"
import { PackagerOptions } from "./packagerApi.js"
import { PublishManager } from "./publish/PublishManager.js"
import { resolveFunction } from "./util/resolve.js"
<<<<<<< HEAD
=======
import { Packager } from "./packager.js.js"
import { PackagerOptions } from "./packagerApi.js.js"
import { PublishManager } from "./publish/PublishManager.js.js"
import { resolveFunction } from "./util/resolve.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
>>>>>>> c92b22265 (tmp save for .js extension migration)

export { Arch, archFromString, getArchSuffix } from "builder-util"
export { AppInfo } from "./appInfo.js"
export {
  AfterExtractContext,
  AfterPackContext,
  BeforePackContext,
  CommonConfiguration,
  Configuration,
  FuseOptionsV1,
  Hook,
  Hooks,
  MetadataDirectories,
  PackContext,
<<<<<<< HEAD
  ToolsetConfig,
=======
>>>>>>> c92b22265 (tmp save for .js extension migration)
} from "./configuration.js"
export {
  BeforeBuildContext,
  CompressionLevel,
  DEFAULT_TARGET,
  DIR_TARGET,
  Platform,
  SourceRepositoryInfo,
  Target,
  TargetConfigType,
  TargetConfiguration,
  TargetSpecificOptions,
} from "./core.js"
<<<<<<< HEAD
export { ElectronBrandingOptions, ElectronPlatformName } from "./electron/ElectronFramework.js"
export { ElectronDownloadOptions } from "./util/electronGet.js"
export { AppXOptions } from "./options/AppXOptions.js"
export { CommonWindowsInstallerConfiguration } from "./options/CommonWindowsInstallerConfiguration.js"
export { FileAssociation } from "./options/FileAssociation.js"
export {
  AppImageOptions,
  CommonLinuxOptions,
  DebOptions,
  FlatpakOptions,
  LinuxConfiguration,
  LinuxDesktopFile,
  LinuxTargetSpecificOptions,
  PacmanOptions,
  RpmOptions,
} from "./options/linuxOptions.js"
export type { DmgContent, DmgOptions, DmgWindow, MacConfiguration, MacOsTargetName, MasConfiguration } from "./options/macOptions.js"
=======
export { ElectronBrandingOptions, ElectronDownloadOptions, ElectronPlatformName } from "./electron/ElectronFramework.js"
export { AppXOptions } from "./options/AppXOptions.js"
export { CommonWindowsInstallerConfiguration } from "./options/CommonWindowsInstallerConfiguration.js"
export { FileAssociation } from "./options/FileAssociation.js"
export { AppImageOptions, CommonLinuxOptions, DebOptions, FlatpakOptions, LinuxConfiguration, LinuxDesktopFile, LinuxTargetSpecificOptions } from "./options/linuxOptions.js"
export { DmgContent, DmgOptions, DmgWindow, MacConfiguration, MacOsTargetName, MasConfiguration } from "./options/macOptions.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)
export { AuthorMetadata, Metadata, RepositoryInfo } from "./options/metadata.js"
export { MsiOptions } from "./options/MsiOptions.js"
export { MsiWrappedOptions } from "./options/MsiWrappedOptions.js"
export { BackgroundAlignment, BackgroundScaling, PkgBackgroundOptions, PkgOptions } from "./options/pkgOptions.js"
export { AsarOptions, FileSet, FilesBuildOptions, PlatformSpecificBuildOptions, Protocol, ReleaseInfo } from "./options/PlatformSpecificBuildOptions.js"
<<<<<<< HEAD
export { PlugDescriptor, SlotDescriptor, SnapcraftOptions, SnapOptions } from "./options/SnapOptions.js"
=======
export { PlugDescriptor, SlotDescriptor, SnapOptions } from "./options/SnapOptions.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)
export { SquirrelWindowsOptions } from "./options/SquirrelWindowsOptions.js"
export { WindowsAzureSigningConfiguration, WindowsConfiguration, WindowsSigntoolConfiguration } from "./options/winOptions.js"
export { BuildResult, Packager } from "./packager.js"
export { ArtifactBuildStarted, ArtifactCreated, PackagerOptions } from "./packagerApi.js"
export { CommonNsisOptions, CustomNsisBinary, NsisOptions, NsisWebOptions, PortableOptions } from "./targets/nsis/nsisOptions.js"

export { CancellationToken, ProgressInfo } from "builder-util-runtime"
export { PublishOptions, UploadTask } from "electron-publish"
export { findIdentity, isSignAllowed } from "./codeSign/macCodeSign.js"
export { WindowsSignOptions } from "./codeSign/windowsCodeSign.js"
export {
  CertificateFromStoreInfo,
  CustomWindowsSign,
  CustomWindowsSignTaskConfiguration,
  FileCodeSigningInfo,
  WindowsSignTaskConfiguration,
<<<<<<< HEAD
  WindowsSignToolManager,
} from "./codeSign/windowsSignToolManager.js"
export { ToolInfo } from "./util/bundledTool.js"
=======
} from "./codeSign/windowsSignToolManager.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)
export { ForgeOptions, buildForge } from "./forge-maker.js"
export { Framework, PrepareApplicationStageDirectoryOptions } from "./Framework.js"
export { LinuxPackager } from "./linuxPackager.js"
export { CustomMacSign, CustomMacSignOptions, MacPackager } from "./macPackager.js"
export { PlatformPackager } from "./platformPackager.js"
export { PublishManager } from "./publish/PublishManager.js"
export { getLicenseAssets, getLicenseFiles } from "./util/license.js"
export { WinPackager } from "./winPackager.js"
<<<<<<< HEAD
<<<<<<< HEAD
=======
export { findIdentity, isSignAllowed } from "./codeSign/macCodeSign.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)
=======

export { getSignVendorPath } from "./codeSign/windowsSignToolManager.js"
export { getElectronVersion } from "./electron/electronVersion.js"
export { executeAppBuilderAsJson } from "./util/appBuilder.js"
export { loadEnv } from "./util/config/load.js"
export { resolveFunction } from "./util/resolve.js"
export { nodeGypRebuild } from "./util/yarn.js"

export { determinePackageManagerEnv } from "./node-module-collector/index.js"
export { computeDefaultAppDirectory, getConfig, doMergeConfigs } from "./util/config/config.js"
export { orNullIfFileNotExist } from "./util/config/load.js"
export { createLazyProductionDeps } from "./util/packageDependencies.js"
export { installOrRebuild } from "./util/yarn.js"
export { PACKAGE_VERSION } from "./version.js"
>>>>>>> fb7cff668 (esm complete on tests as well?)

export { getBinFromUrl } from "./binDownload.js"
export { Publish } from "./core.js"
export { computeSafeArtifactNameIfNeeded } from "./platformPackager.js"
export { createPublisher } from "./publish/PublishManager.js"
<<<<<<< HEAD
export { createBlockmap } from "./targets/differentialUpdateInfoBuilder.js"
export { execWine } from "./wine.js"

export { validateConfiguration } from "./util/config/config.js"
export { PM } from "./node-module-collector/packageManager.js"
export { readAsarJson, readAsar, AsarFilesystem } from "./asar/asar.js"

export { computeArchToTargetNamesMap } from "./targets/targetFactory.js"

=======
export { Identity } from "./codeSign/macCodeSign.js"
export { DoPackOptions } from "./platformPackager.js"
export { parsePlistFile, PlistObject } from "./util/plist.js"
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
export { expandMacro } from "./util/macroExpander.js"
export { hoist, HoisterTree, HoisterResult, HoisterDependencyKind } from "./node-module-collector/hoist.js"
export { getLinuxToolsPath } from "./targets/tools.js"
export { parsePlistFile, PlistObject } from "./util/plist.js"
export { AsarIntegrity } from "./asar/integrity.js"
export { getCollectorByPackageManager } from "./node-module-collector/index.js"
export { installDependencies } from "./util/yarn.js"
export { detectPackageManager } from "./node-module-collector/packageManager.js"

export { getRepositoryInfo } from "./util/repositoryInfo.js"
export { Identity } from "./codeSign/macCodeSign.js"
export { DoPackOptions } from "./platformPackager.js"

export { createKeychain } from "./codeSign/macCodeSign.js"

export { downloadArtifact } from "./binDownload.js"

const expectedOptions = new Set(["publish", "targets", "mac", "win", "linux", "projectDir", "platformPackagerFactory", "config", "effectiveOptionComputed", "prepackaged"])

export function checkBuildRequestOptions(options: PackagerOptions & PublishOptions) {
  for (const optionName of Object.keys(options)) {
    if (!expectedOptions.has(optionName) && (options as any)[optionName] !== undefined) {
      throw new InvalidConfigurationError(`Unknown option "${optionName}"`)
    }
  }
}

export function build(options: PackagerOptions & PublishOptions, packager: Packager = new Packager(options)): Promise<Array<string>> {
  checkBuildRequestOptions(options)

  const publishManager = new PublishManager(packager, options)
  const sigIntHandler = () => {
    log.warn("cancelled by SIGINT")
    packager.cancellationToken.cancel()
    publishManager.cancelTasks()
  }
  process.once("SIGINT", sigIntHandler)

  const promise = packager.build().then(async buildResult => {
    const afterAllArtifactBuild = await resolveFunction(
      packager.appInfo.type,
      buildResult.configuration.afterAllArtifactBuild,
      "afterAllArtifactBuild",
      await packager.getWorkspaceRoot()
    )
    if (afterAllArtifactBuild != null) {
      const newArtifacts = asArray(await Promise.resolve(afterAllArtifactBuild(buildResult)))
      if (newArtifacts.length === 0 || !publishManager.isPublish) {
        return buildResult.artifactPaths
      }

      const publishConfigurations = await publishManager.getGlobalPublishConfigurations()
      if (publishConfigurations == null || publishConfigurations.length === 0) {
        return buildResult.artifactPaths
      }

      for (const newArtifact of newArtifacts) {
        if (buildResult.artifactPaths.includes(newArtifact)) {
          log.warn({ newArtifact }, "skipping publish of artifact, already published")
          continue
        }
        buildResult.artifactPaths.push(newArtifact)
        for (const publishConfiguration of publishConfigurations) {
          await publishManager.scheduleUpload(
            publishConfiguration,
            {
              file: newArtifact,
              arch: null,
            },
            packager.appInfo
          )
        }
      }
    }
    return buildResult.artifactPaths
  })

  return executeFinally(promise, isErrorOccurred => {
    let promise: Promise<any>
    if (isErrorOccurred) {
      publishManager.cancelTasks()
      promise = Promise.resolve(null)
    } else {
      promise = publishManager.awaitTasks()
    }

    return promise.then(() => {
      packager.clearPackagerEventListeners()
      process.removeListener("SIGINT", sigIntHandler)
    })
  })
}
