import { MemoLazy, Nullish } from "builder-util-runtime"
import { Lazy } from "lazy-val"
import { Target } from "../core"
import { WindowsConfiguration } from "../options/winOptions"
import { WindowsSignOptions } from "./windowsCodeSign"
import { CertificateFromStoreInfo, FileCodeSigningInfo } from "./windowsSignToolManager"

export interface SignManager {
  readonly computedPublisherName: Lazy<Array<string> | null>
  readonly cscInfo: MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>
  computePublisherName(target: Target, publisherName: string | Nullish): Promise<string>
  initialize(): Promise<void>
  signFile(options: WindowsSignOptions): Promise<boolean>
}
