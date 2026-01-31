import { MemoLazy, Nullish } from "builder-util-runtime"
import { Lazy } from "lazy-val"
import { Target } from "../core.js"
import { WindowsConfiguration } from "../options/winOptions.js"
import { WindowsSignOptions } from "./windowsCodeSign.js"
import { CertificateFromStoreInfo, FileCodeSigningInfo } from "./windowsSignToolManager.js"

export interface SignManager {
  readonly computedPublisherName: Lazy<Array<string> | null>
  readonly cscInfo: MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>
  computePublisherName(target: Target, publisherName: string | Nullish): Promise<string>
  initialize(): Promise<void>
  signFile(options: WindowsSignOptions): Promise<boolean>
}
