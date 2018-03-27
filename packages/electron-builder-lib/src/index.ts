import { executeFinally } from "builder-util/out/promise"
import { PublishOptions } from "electron-publish/out/publisher"
import { log } from "builder-util"
import { Packager } from "./packager"
import { PackagerOptions } from "./packagerApi"
import { PublishManager } from "./publish/PublishManager"

export { Packager, BuildResult } from "./packager"
export { PackagerOptions, ArtifactCreated } from "./packagerApi"
export { TargetConfiguration, Platform, Target, DIR_TARGET, BeforeBuildContext, SourceRepositoryInfo, TargetSpecificOptions, TargetConfigType, DEFAULT_TARGET, CompressionLevel } from "./core"
export { getArchSuffix, Arch, archFromString } from "builder-util"
export { Configuration, AfterPackContext, MetadataDirectories, ElectronDownloadOptions } from "./configuration"
export { PlatformSpecificBuildOptions, AsarOptions, FileSet, Protocol, ReleaseInfo } from "./options/PlatformSpecificBuildOptions"
export { FileAssociation } from "./options/FileAssociation"
export { MacConfiguration, DmgOptions, MasConfiguration, MacOsTargetName, PkgOptions, DmgContent, DmgWindow } from "./options/macOptions"
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
export { WindowsSignOptions, CustomWindowsSignTaskConfiguration, WindowsSignTaskConfiguration, CustomWindowsSign, FileCodeSigningInfo, CertificateFromStoreInfo } from "./windowsCodeSign"
export { CancellationToken, ProgressInfo } from "builder-util-runtime"
export { PublishOptions, UploadTask } from "electron-publish"
export { PublishManager } from "./publish/PublishManager"
export { PlatformPackager } from "./platformPackager"
export { Framework, PrepareApplicationStageDirectoryOptions } from "./Framework"
export { buildForge, ForgeOptions } from "./forge-maker"

export async function build(options: PackagerOptions & PublishOptions, packager: Packager = new Packager(options)): Promise<Array<string>> {
  // because artifact event maybe dispatched several times for different publish providers
  const artifactPaths = new Set<string>()
  packager.artifactCreated(event => {
    if (event.file != null) {
      artifactPaths.add(event.file)
    }
  })

  const publishManager = new PublishManager(packager, options)
  const sigIntHandler = () => {
    log.warn("cancelled by SIGINT")
    packager.cancellationToken.cancel()
    publishManager.cancelTasks()
  }
  process.once("SIGINT", sigIntHandler)

  return await executeFinally(packager.build().then(() => Array.from(artifactPaths)), errorOccurred => {
    let promise: Promise<any>
    if (errorOccurred) {
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