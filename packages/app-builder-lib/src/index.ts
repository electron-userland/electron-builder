import { InvalidConfigurationError, executeFinally, log } from "builder-util"
import { asArray } from "builder-util-runtime"
import { PublishOptions } from "electron-publish"
import { Packager } from "./packager"
import { PackagerOptions } from "./packagerApi"
import { PublishManager } from "./publish/PublishManager"
import { resolveFunction } from "./util/resolve"

export { Arch, archFromString, getArchSuffix } from "builder-util"
export { AppInfo } from "./appInfo"
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
} from "./configuration"
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
} from "./core"
export { ElectronBrandingOptions, ElectronPlatformName } from "./electron/ElectronFramework"
export { ElectronDownloadOptions } from "./util/electronGet"
export { AppXOptions } from "./options/AppXOptions"
export { CommonWindowsInstallerConfiguration } from "./options/CommonWindowsInstallerConfiguration"
export { FileAssociation } from "./options/FileAssociation"
export { AppImageOptions, CommonLinuxOptions, DebOptions, FlatpakOptions, LinuxConfiguration, LinuxDesktopFile, LinuxTargetSpecificOptions } from "./options/linuxOptions"
export { DmgContent, DmgOptions, DmgWindow, MacConfiguration, MacOsTargetName, MasConfiguration } from "./options/macOptions"
export { AuthorMetadata, Metadata, RepositoryInfo } from "./options/metadata"
export { MsiOptions } from "./options/MsiOptions"
export { MsiWrappedOptions } from "./options/MsiWrappedOptions"
export { BackgroundAlignment, BackgroundScaling, PkgBackgroundOptions, PkgOptions } from "./options/pkgOptions"
export { AsarOptions, FileSet, FilesBuildOptions, PlatformSpecificBuildOptions, Protocol, ReleaseInfo } from "./options/PlatformSpecificBuildOptions"
export { PlugDescriptor, SlotDescriptor, SnapOptions } from "./options/SnapOptions"
export { SquirrelWindowsOptions } from "./options/SquirrelWindowsOptions"
export { WindowsAzureSigningConfiguration, WindowsConfiguration, WindowsSigntoolConfiguration } from "./options/winOptions"
export { BuildResult, Packager } from "./packager"
export { ArtifactBuildStarted, ArtifactCreated, PackagerOptions } from "./packagerApi"
export { CommonNsisOptions, CustomNsisBinary, NsisOptions, NsisWebOptions, PortableOptions } from "./targets/nsis/nsisOptions"

export { CancellationToken, ProgressInfo } from "builder-util-runtime"
export { PublishOptions, UploadTask } from "electron-publish"
export { WindowsSignOptions } from "./codeSign/windowsCodeSign"
export {
  CertificateFromStoreInfo,
  CustomWindowsSign,
  CustomWindowsSignTaskConfiguration,
  FileCodeSigningInfo,
  WindowsSignTaskConfiguration,
} from "./codeSign/windowsSignToolManager"
export { ForgeOptions, buildForge } from "./forge-maker"
export { Framework, PrepareApplicationStageDirectoryOptions } from "./Framework"
export { LinuxPackager } from "./linuxPackager"
export { CustomMacSign, CustomMacSignOptions, MacPackager } from "./macPackager"
export { PlatformPackager } from "./platformPackager"
export { PublishManager } from "./publish/PublishManager"
export { WinPackager } from "./winPackager"

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
    const afterAllArtifactBuild = await resolveFunction(packager.appInfo.type, buildResult.configuration.afterAllArtifactBuild, "afterAllArtifactBuild")
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
