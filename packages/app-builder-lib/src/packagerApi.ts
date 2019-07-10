import { Arch } from "builder-util"
import { PublishConfiguration } from "builder-util-runtime"
import { Configuration } from "./configuration"
import { Platform, Target } from "./core"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import { UploadTask } from "electron-publish"

export interface PackagerOptions {
  targets?: Map<Platform, Map<Arch, Array<string>>>

  mac?: Array<string>
  linux?: Array<string>
  win?: Array<string>

  projectDir?: string | null

  platformPackagerFactory?: ((info: Packager, platform: Platform) => PlatformPackager<any>) | null

  readonly config?: Configuration | string | null

  readonly effectiveOptionComputed?: (options: any) => Promise<boolean>

  readonly prepackaged?: string | null
}

export interface ArtifactCreated extends UploadTask {
  readonly packager: PlatformPackager<any>
  readonly target: Target | null

  updateInfo?: any

  readonly safeArtifactName?: string | null

  readonly publishConfig?: PublishConfiguration | null

  readonly isWriteUpdateInfo?: boolean
}

export interface ArtifactBuildStarted {
  readonly targetPresentableName: string

  readonly file: string
  // null for NSIS
  readonly arch: Arch | null
}