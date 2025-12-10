import { MemoLazy, Nullish } from "builder-util-runtime"
import { Lazy } from "lazy-val"
<<<<<<< HEAD
<<<<<<< HEAD
import { Target } from "../core.js"
import { WindowsConfiguration } from "../options/winOptions.js"
import { WindowsSignOptions } from "./windowsCodeSign.js"
import { CertificateFromStoreInfo, FileCodeSigningInfo } from "./windowsSignToolManager.js"
<<<<<<< HEAD
=======
import { Target } from "../core"
import { WindowsConfiguration } from "../options/winOptions"
=======
import { Target } from "../core.js"
import { WindowsConfiguration } from "../options/winOptions.js"
>>>>>>> d26567f58 (tmp save)
import { WindowsSignOptions } from "./windowsCodeSign.js.js"
import { CertificateFromStoreInfo, FileCodeSigningInfo } from "./windowsSignToolManager.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
>>>>>>> c92b22265 (tmp save for .js extension migration)

export interface SignManager {
  readonly computedPublisherName: Lazy<Array<string> | null>
  readonly cscInfo: MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>
  computePublisherName(target: Target, publisherName: string | Nullish): Promise<string>
  initialize(): Promise<void>
  signFile(options: WindowsSignOptions): Promise<boolean>
}
