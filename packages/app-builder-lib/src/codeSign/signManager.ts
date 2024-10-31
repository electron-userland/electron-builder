import { Lazy } from "lazy-val"
import { WindowsSignOptions } from "./windowsCodeSign"
import { Target } from "../core"
import { MemoLazy } from "builder-util-runtime"
import { FileCodeSigningInfo, CertificateFromStoreInfo } from "./windowsSignToolManager"
import { WindowsConfiguration } from "../options/winOptions"

export interface SignManager {
  readonly computedPublisherName: Lazy<Array<string> | null>
  readonly cscInfo: MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>
  computePublisherName(target: Target, publisherName: string | null | undefined): Promise<string>
  initialize(): Promise<void>
  signFile(options: WindowsSignOptions): Promise<boolean>
}
