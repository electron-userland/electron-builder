import { Arch } from "builder-util"
import { PublishConfiguration } from "builder-util-runtime"
import { UploadTask } from "electron-publish"
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> c92b22265 (tmp save for .js extension migration)
import { Configuration } from "./configuration.js"
import { Platform, Target } from "./core.js"
import { Packager } from "./packager.js"
import { PlatformPackager } from "./platformPackager.js"
<<<<<<< HEAD
=======
import { Configuration } from "./configuration.js.js"
import { Platform, Target } from "./core.js.js"
import { Packager } from "./packager.js.js"
import { PlatformPackager } from "./platformPackager.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
>>>>>>> c92b22265 (tmp save for .js extension migration)

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
