import { Platform, Arch } from "electron-builder-core"
import { PlatformPackager } from "./platformPackager"
import { DevMetadata, BuildMetadata, AppMetadata } from "./metadata"
import { PublishConfiguration } from "electron-builder-http/out/publishOptions"
import { TmpDir } from "electron-builder-util/out/tmp"
import { AppInfo } from "./appInfo"

export interface PackagerOptions {
  targets?: Map<Platform, Map<Arch, string[]>>

  projectDir?: string | null

  cscLink?: string | null
  cscKeyPassword?: string | null

  cscInstallerLink?: string | null
  cscInstallerKeyPassword?: string | null

  platformPackagerFactory?: ((info: BuildInfo, platform: Platform, cleanupTasks: Array<() => Promise<any>>) => PlatformPackager<any>) | null

  /**
   * The same as [development package.json](https://github.com/electron-userland/electron-builder/wiki/Options#development-packagejson).
   *
   * Development `package.json` will be still read, but options specified in this object will override.
   */
  readonly devMetadata?: DevMetadata

  /*
   See [.build](#BuildMetadata).
   */
  readonly config?: BuildMetadata

  /**
   * The same as [application package.json](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata).
   *
   * Application `package.json` will be still read, but options specified in this object will override.
   */
  readonly appMetadata?: AppMetadata

  readonly effectiveOptionComputed?: (options: any) => Promise<boolean>

  readonly extraMetadata?: any

  readonly prepackaged?: string
}

export interface BuildInfo {
  options: PackagerOptions

  metadata: AppMetadata

  devMetadata: DevMetadata

  config: BuildMetadata

  projectDir: string
  appDir: string
  devPackageFile: string

  electronVersion: string

  isTwoPackageJsonProjectLayoutUsed: boolean

  appInfo: AppInfo

  readonly tempDirManager: TmpDir

  repositoryInfo: Promise<SourceRepositoryInfo | null>

  dispatchArtifactCreated(event: ArtifactCreated): void
}

export interface ArtifactCreated {
  readonly packager: PlatformPackager<any>

  readonly file?: string
  readonly data?: Buffer

  readonly artifactName?: string

  readonly publishConfig?: PublishConfiguration
}

export interface SourceRepositoryInfo {
  type: string
  domain: string
  user: string
  project: string
}