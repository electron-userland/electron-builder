import { Arch, InvalidConfigurationError, log } from "builder-util"
import { asArray, MemoLazy } from "builder-util-runtime"
import { writeJson } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { WindowsAzureSigningConfig, WindowsConfiguration } from "../../options/winOptions.js"
import { getWindowsKitsBundle } from "../../toolsets/winCodeSign.js"
import { VmManager } from "../../vm/vm.js"
import { WineVmManager } from "../../vm/WineVm.js"
import { WinPackager } from "../../winPackager.js"
import { SignManager } from "../signManager.js"
import { WindowsSignOptions } from "./windowsCodeSign.js"
import { CertificateFromStoreInfo, FileCodeSigningInfo } from "./windowsSignToolManager.js"

export class WindowsSignAzureManager implements SignManager {
  private readonly signing: WindowsAzureSigningConfig

  // signtool.exe is a Windows PE binary; use Wine on non-Windows (same pattern as MsiTarget).
  private readonly vm: VmManager = process.platform === "win32" ? new VmManager() : new WineVmManager(this.packager.config.toolsets?.wine, this.packager.buildResourcesDir)

  readonly computedPublisherName = new Lazy<Array<string> | null>(() => {
    const { publisherName } = this.signing
    if (publisherName === null) {
      return Promise.resolve(null)
    } else if (publisherName != null) {
      return Promise.resolve(asArray(publisherName))
    }
    return Promise.resolve(null)
  })

  constructor(private readonly packager: WinPackager) {
    const signing = packager.platformOptions.signing
    if (signing?.type !== "azure") {
      throw new Error(`WindowsSignAzureManager requires signing.type = "azure", got: ${signing?.type}`)
    }
    this.signing = signing
  }

  async initialize(): Promise<void> {
    // No-op: Azure.CodeSigning.Dlib.dll is bundled in the winCodeSign 1.x toolset.
  }

  computePublisherName(): Promise<string> {
    return Promise.resolve(this.signing.publisherName)
  }

  readonly cscInfo = new MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>(
    () => this.packager.platformOptions,
    _selected => Promise.resolve(null)
  )

  async signFile(options: WindowsSignOptions): Promise<boolean> {
    const { signing } = this

    const winCodeSign = this.packager.config.toolsets?.winCodeSign
    if (winCodeSign == null || winCodeSign === "0.0.0") {
      throw new InvalidConfigurationError(
        'Azure Trusted Signing requires winCodeSign toolset 1.x or later. Set toolsets.winCodeSign to "1.0.0" or "1.1.0" in your electron-builder configuration.'
      )
    }

    // Resolve signtool.exe and Azure.CodeSigning.Dlib.dll from the Windows Kits bundle.
    const arch = process.arch === "x64" ? Arch.x64 : process.arch === "arm64" ? Arch.arm64 : Arch.ia32
    const { kit: kitDir } = await getWindowsKitsBundle({ winCodeSign, arch })
    const signtoolPath = path.resolve(kitDir, "signtool.exe")
    const dlibPath = path.resolve(kitDir, "Azure.CodeSigning.Dlib.dll")

    // Temp file registered with packager's TmpDir — cleaned up automatically after build.
    const metadataPath = await this.packager.getTempFile(".json")
    await writeJson(metadataPath, {
      Endpoint: signing.endpoint,
      CodeSigningAccountName: signing.codeSigningAccountName,
      CertificateProfileName: signing.certificateProfileName,
      ...signing.additionalMetadata,
    })

    const args = [
      "sign",
      "/fd",
      (signing.fileDigest ?? "SHA256").toUpperCase(),
      "/tr",
      signing.timestampRfc3161 ?? "http://timestamp.acs.microsoft.com",
      "/td",
      (signing.timestampDigest ?? "SHA256").toUpperCase(),
      "/dlib",
      this.vm.toVmFile(dlibPath),
      "/dmdf",
      this.vm.toVmFile(metadataPath),
      this.vm.toVmFile(options.path),
    ]

    log.info(
      {
        file: log.filePath(options.path),
        endpoint: signing.endpoint,
        account: signing.codeSigningAccountName,
        profile: signing.certificateProfileName,
      },
      "signing with Azure Trusted Signing (signtool /dlib)"
    )

    await this.vm.exec(signtoolPath, args)
    return true
  }
}
