import { Arch } from "builder-util"
import { PackageFileInfo, PublishConfiguration } from "builder-util-runtime"
import { Configuration } from "./configuration"
import { Platform, Target } from "./core"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"

export interface PackagerOptions {
  targets?: Map<Platform, Map<Arch, Array<string>>>

  projectDir?: string | null

  cscLink?: string | null
  cscKeyPassword?: string | null

  cscInstallerLink?: string | null
  cscInstallerKeyPassword?: string | null

  platformPackagerFactory?: ((info: Packager, platform: Platform) => PlatformPackager<any>) | null

  readonly config?: Configuration | string | null

  readonly effectiveOptionComputed?: (options: any) => Promise<boolean>

  readonly prepackaged?: string | null
}

export interface ArtifactCreated {
  readonly packager: PlatformPackager<any>
  readonly target: Target | null
  readonly arch: Arch | null

  readonly file?: string
  readonly data?: Buffer

  readonly packageFiles?: { [arch: string]: PackageFileInfo } | null

  readonly safeArtifactName?: string | null

  readonly publishConfig?: PublishConfiguration

  readonly isWriteUpdateInfo?: boolean
}