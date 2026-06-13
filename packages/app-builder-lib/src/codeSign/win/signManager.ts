import { MemoLazy } from "builder-util-runtime"
import { Lazy } from "lazy-val"
import { Target } from "../../core.js"
import { resolveWindowsSigningConfiguration, WindowsConfiguration } from "../../options/winOptions.js"
import type { WinPackager } from "../../winPackager.js"
import { HsmSignManager } from "./hsmSignManager.js"
import { Pkcs11SignManager } from "./pkcs11SignManager.js"
import { CertificateFromStoreInfo, FileCodeSigningInfo, SigntoolSignManager } from "./signtoolBaseSignManager.js"
import { WindowsSignAzureManager } from "./windowsSignAzureManager.js"
import { WindowsSignOptions } from "./windowsCodeSign.js"

export interface SignManager {
  readonly computedPublisherName: Lazy<Array<string> | null>
  readonly cscInfo: MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>
  computePublisherName(target: Target, publisherName: string | null): Promise<string>
  initialize(): Promise<void>
  signFile(options: WindowsSignOptions): Promise<boolean>
}

export function createSignManager(packager: WinPackager): SignManager {
  switch (resolveWindowsSigningConfiguration(packager.platformOptions)?.type) {
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
