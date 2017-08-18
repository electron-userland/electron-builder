import { PublishConfiguration } from "electron-builder-http/out/publishOptions"
import { Arch } from "electron-builder-util"
import { Platform, Target } from "./core"
import { Config } from "./metadata"
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

  readonly config?: Config | string | null

  readonly effectiveOptionComputed?: (options: any) => Promise<boolean>

  readonly prepackaged?: string | null
}

export interface ArtifactCreated {
  readonly packager: PlatformPackager<any>
  readonly target: Target | null
  readonly arch: Arch | null

  readonly file?: string
  readonly data?: Buffer

  readonly safeArtifactName?: string | null

  readonly publishConfig?: PublishConfiguration

  readonly isWriteUpdateInfo?: boolean
}