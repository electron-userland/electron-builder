import { FileTransformer } from "builder-util/out/fs"
import { AsarIntegrity } from "./asar/integrity"
import { Platform } from "./core"
import { PlatformPackager } from "./platformPackager"

export interface Framework {
  readonly name: string
  readonly version: string
  readonly distMacOsAppName: string
  readonly macOsDefaultTargets: Array<string>
  readonly defaultAppIdPrefix: string

  readonly isNpmRebuildRequired: boolean

  readonly isDefaultAppIconProvided: boolean
  getDefaultIcon?(platform: Platform): string

  prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions): Promise<any>

  beforeCopyExtraFiles?(packager: PlatformPackager<any>, appOutDir: string, asarIntegrity: AsarIntegrity | null): Promise<any>

  createTransformer?(): FileTransformer | null
}

export interface PrepareApplicationStageDirectoryOptions {
  readonly packager: PlatformPackager<any>
  /**
   * Platform doesn't process application output directory in any way. Unpack implementation must create or empty dir if need.
   */
  readonly appOutDir: string
  readonly platformName: string
  readonly arch: string
  readonly version: string
}

export function isElectronBased(framework: Framework) {
  return framework.name === "electron" || framework.name === "muon"
}