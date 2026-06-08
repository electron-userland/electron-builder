import { MemoLazy, Nullish } from "builder-util-runtime"
import { Lazy } from "lazy-val"
import { Target } from "../core"
import { WindowsConfiguration } from "../options/winOptions"
import type { WinPackager } from "../winPackager"
import { HsmSignManager } from "./hsmSignManager"
import { Pkcs11SignManager } from "./pkcs11SignManager"
import { CertificateFromStoreInfo, FileCodeSigningInfo, SigntoolSignManager } from "./signtoolBaseSignManager"
import { WindowsSignAzureManager } from "./windowsSignAzureManager"
import { WindowsSignOptions } from "./windowsCodeSign"

export interface SignManager {
  readonly computedPublisherName: Lazy<Array<string> | null>
  readonly cscInfo: MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>
  computePublisherName(target: Target, publisherName: string | Nullish): Promise<string>
  initialize(): Promise<void>
  signFile(options: WindowsSignOptions): Promise<boolean>
}

export function createSignManager(packager: WinPackager): SignManager {
  switch (packager.platformSpecificBuildOptions.signing?.type) {
    case "azure":
      return new WindowsSignAzureManager(packager)
    case "hsm":
      return new HsmSignManager(packager)
    case "pkcs11":
      return new Pkcs11SignManager(packager)
    case "signtool":
    default:
      return new SigntoolSignManager(packager)
  }
}
