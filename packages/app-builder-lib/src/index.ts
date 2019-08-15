import { executeFinally } from "builder-util/out/promise"
import { PublishOptions } from "electron-publish/out/publisher"
import { log, InvalidConfigurationError } from "builder-util"
import { asArray } from "builder-util-runtime"
import { Packager } from "./packager"
import { PackagerOptions } from "./packagerApi"
import { resolveFunction } from "./platformPackager"
import { PublishManager } from "./publish/PublishManager"

export { Packager, BuildResult } from "./packager"
export { PackagerOptions, ArtifactCreated, ArtifactBuildStarted } from "./packagerApi"
export { TargetConfiguration, Platform, Target, DIR_TARGET, BeforeBuildContext, SourceRepositoryInfo, TargetSpecificOptions, TargetConfigType, DEFAULT_TARGET, CompressionLevel } from "./core"
export { getArchSuffix, Arch, archFromString } from "builder-util"
export { Configuration, AfterPackContext, MetadataDirectories } from "./configuration"
export { ElectronDownloadOptions, ElectronPlatformName } from "./electron/ElectronFramework"
export { PlatformSpecificBuildOptions, AsarOptions, FileSet, Protocol, ReleaseInfo } from "./options/PlatformSpecificBuildOptions"
export { FileAssociation } from "./options/FileAssociation"
export { MacConfiguration, DmgOptions, MasConfiguration, MacOsTargetName, DmgContent, DmgWindow } from "./options/macOptions"
export { PkgOptions, PkgBackgroundOptions, BackgroundAlignment, BackgroundScaling } from "./options/pkgOptions"
export { WindowsConfiguration } from "./options/winOptions"
export { AppXOptions } from "./options/AppXOptions"
export { MsiOptions } from "./options/MsiOptions"
export { CommonWindowsInstallerConfiguration } from "./options/CommonWindowsInstallerConfiguration"
export { NsisOptions, NsisWebOptions, PortableOptions, CommonNsisOptions } from "./targets/nsis/nsisOptions"
export { LinuxConfiguration, DebOptions, CommonLinuxOptions, LinuxTargetSpecificOptions, AppImageOptions } from "./options/linuxOptions"
export { SnapOptions } from "./options/SnapOptions"
export { Metadata, AuthorMetadata, RepositoryInfo } from "./options/metadata"
export { AppInfo } from "./appInfo"
export { SquirrelWindowsOptions } from "./options/SquirrelWindowsOptions"
export { WindowsSignOptions, CustomWindowsSignTaskConfiguration, WindowsSignTaskConfiguration, CustomWindowsSign, FileCodeSigningInfo, CertificateFromStoreInfo } from "./codeSign/windowsCodeSign"
export { CancellationToken, ProgressInfo } from "builder-util-runtime"
export { PublishOptions, UploadTask } from "electron-publish"
export { PublishManager } from "./publish/PublishManager"
export { PlatformPackager } from "./platformPackager"
export { Framework, PrepareApplicationStageDirectoryOptions } from "./Framework"
export { buildForge, ForgeOptions } from "./forge-maker"
export { SnapStoreOptions } from "./publish/SnapStorePublisher"

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

  const promise = packager.build()
    .then(async buildResult => {
      const afterAllArtifactBuild = resolveFunction(buildResult.configuration.afterAllArtifactBuild, "afterAllArtifactBuild")
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
          buildResult.artifactPaths.push(newArtifact)
          for (const publishConfiguration of publishConfigurations) {
            publishManager.scheduleUpload(publishConfiguration, {
              file: newArtifact,
              arch: null
            }, packager.appInfo)
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
    }
    else {
      promise = publishManager.awaitTasks()
    }

    return promise
      .then(() => process.removeListener("SIGINT", sigIntHandler))
  })
}