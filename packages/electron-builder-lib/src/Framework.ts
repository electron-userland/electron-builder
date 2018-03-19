import { AsarIntegrity } from "./asar/integrity"
import { PlatformPackager } from "./platformPackager"

export interface Framework {
  readonly name: string
  readonly version: string
  readonly distMacOsAppName: string

  readonly isNpmRebuildRequired: boolean

  unpackFramework(options: UnpackFrameworkTaskOptions): Promise<any>

  beforeCopyExtraFiles?(packager: PlatformPackager<any>, appOutDir: string, asarIntegrity: AsarIntegrity | null): Promise<any>
}

export interface UnpackFrameworkTaskOptions {
  readonly packager: PlatformPackager<any>
  readonly appOutDir: string
  readonly platformName: string
  readonly arch: string
  readonly version: string
}

export function isElectronBased(framework: Framework) {
  return framework.name === "electron" || framework.name === "muon"
}