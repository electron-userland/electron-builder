import { FileTransformer } from "builder-util"
import { AsarIntegrity } from "./asar/integrity"
import { AfterPackContext, ElectronPlatformName, Platform, PlatformPackager } from "./index"

export interface Framework {
  readonly name: string
  readonly version: string
  readonly productName: string
  readonly macOsDefaultTargets: Array<string>
  readonly defaultAppIdPrefix: string

  readonly isNpmRebuildRequired: boolean

  readonly isCopyElevateHelper: boolean

  getDefaultIcon?(platform: Platform): string | null

  getMainFile?(platform: Platform): string | null

  getExcludedDependencies?(platform: Platform): Array<string> | null

  prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions): Promise<any>

  beforeCopyExtraFiles?(options: BeforeCopyExtraFilesOptions): Promise<any>

  afterPack?(context: AfterPackContext): Promise<any>

  createTransformer?(): FileTransformer | null
}

export interface BeforeCopyExtraFilesOptions {
  packager: PlatformPackager<any>
  appOutDir: string

  asarIntegrity: AsarIntegrity | null

  // ElectronPlatformName
  platformName: string
}

export interface PrepareApplicationStageDirectoryOptions {
  readonly packager: PlatformPackager<any>
  /**
   * Platform doesn't process application output directory in any way. Unpack implementation must create or empty dir if need.
   */
  readonly appOutDir: string
  readonly platformName: ElectronPlatformName
  readonly arch: string
}

export function isElectronBased(framework: Framework): boolean {
  return framework.name === "electron"
}
