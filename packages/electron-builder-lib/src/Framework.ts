import { PlatformPackager } from "./platformPackager"

export interface Framework {
  readonly name: string
  readonly version: string
  readonly distMacOsAppName: string

  readonly isNpmRebuildRequired: boolean

  unpackFramework(options: UnpackFrameworkTaskOptions): Promise<any>
}

export interface UnpackFrameworkTaskOptions {
  readonly packager: PlatformPackager<any>
  readonly appOutDir: string
  readonly platformName: string
  readonly arch: string
  readonly version: string
}