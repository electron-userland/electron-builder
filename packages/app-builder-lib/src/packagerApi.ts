import { Arch } from "builder-util"
import { PublishConfiguration } from "builder-util-runtime"
import { UploadTask } from "electron-publish"
import type { AfterPackContext, Configuration } from "./configuration.js"
import { Platform, Target } from "./core.js"
import { Packager } from "./packager.js"
import { PlatformPackager } from "./platformPackager.js"

export interface PackagerOptions {
  targets?: Map<Platform, Map<Arch, Array<string>>>

  mac?: Array<string>
  linux?: Array<string>
  win?: Array<string>

  projectDir?: string | null

  platformPackagerFactory?: ((info: Packager, platform: Platform) => PlatformPackager<any>) | null

  readonly config?: Configuration | string | null

  readonly effectiveOptionComputed?: (options: any) => Promise<boolean>

  /**
   * @internal Test-only. Invoked once per platform/arch after the app directory has been fully assembled
   * (asar, extra resources, `afterPack`, fuses, signing) and before any target is built. Return `true`
   * to skip building the targets for that arch (the same effect as `effectiveOptionComputed`, but at
   * the app-directory stage). Not part of `Configuration`; programmatic API only.
   *
   * Fires once per `doPack` invocation: once per platform/arch, plus once per `mas`/`mas-dev` target on macOS
   * (those are packed separately from the other mac targets).
   */
  readonly afterPackTestHook?: (context: AfterPackContext) => Promise<boolean>

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
