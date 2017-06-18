import { CancellationToken } from "electron-builder-http"
import { PublishConfiguration } from "electron-builder-http/out/publishOptions"
import { TmpDir } from "electron-builder-util"
import { AppInfo } from "./appInfo"
import { Arch, Platform, SourceRepositoryInfo, Target } from "./core"
import { AfterPackContext, Config, Metadata } from "./metadata"
import { PlatformPackager } from "./platformPackager"

export interface PackagerOptions {
  targets?: Map<Platform, Map<Arch, Array<string>>>

  projectDir?: string | null

  cscLink?: string | null
  cscKeyPassword?: string | null

  cscInstallerLink?: string | null
  cscInstallerKeyPassword?: string | null

  platformPackagerFactory?: ((info: BuildInfo, platform: Platform, cleanupTasks: Array<() => Promise<any>>) => PlatformPackager<any>) | null

  readonly config?: Config | string | null

  readonly effectiveOptionComputed?: (options: any) => Promise<boolean>

  readonly prepackaged?: string
}

export interface BuildInfo {
  readonly options: PackagerOptions

  readonly metadata: Metadata

  readonly config: Config

  readonly projectDir: string
  readonly appDir: string

  readonly electronVersion: string
  readonly muonVersion?: string | null

  readonly isTwoPackageJsonProjectLayoutUsed: boolean

  readonly appInfo: AppInfo

  readonly tempDirManager: TmpDir

  readonly repositoryInfo: Promise<SourceRepositoryInfo | null>

  readonly isPrepackedAppAsar: boolean

  readonly prepackaged?: string | null

  readonly cancellationToken: CancellationToken

  dispatchArtifactCreated(event: ArtifactCreated): void

  afterPack(context: AfterPackContext): Promise<void>
}

export interface ArtifactCreated {
  readonly packager: PlatformPackager<any>
  readonly target: Target | null
  readonly arch: Arch | null

  readonly file?: string
  readonly data?: Buffer

  readonly safeArtifactName?: string

  readonly publishConfig?: PublishConfiguration
}