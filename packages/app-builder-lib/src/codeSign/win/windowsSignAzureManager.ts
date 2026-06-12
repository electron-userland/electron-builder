import { Arch, log } from "builder-util"
import { asArray, MemoLazy } from "builder-util-runtime"
import _fsExtra from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { resolveWindowsSigningConfiguration, WindowsAzureSigningConfig, WindowsConfiguration } from "../../options/winOptions.js"
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
    const signing = resolveWindowsSigningConfiguration(packager.platformOptions)
    if (signing?.type !== "azure") {
      throw new Error(`WindowsSignAzureManager requires signing.type = "azure", got: ${signing?.type}`)
    }
    this.signing = signing
  }

  private isLegacyMode(): boolean {
    const wcs = this.packager.config.toolsets?.winCodeSign
    return wcs == null || wcs === "0.0.0"
  }

  async initialize(): Promise<void> {
    if (!this.isLegacyMode()) {
      return
    }

    log.warn(
      null,
      "Azure Trusted Signing: falling back to legacy PowerShell (Invoke-TrustedSigning) because toolsets.winCodeSign is not set to 1.x. " +
        'Set `toolsets.winCodeSign: "1.1.0"` in your electron-builder config to use the faster signtool /dlib integration.'
    )

    const vm = await this.packager.vm.value
    const ps = await vm.powershellCommand.value
    log.info(null, "installing required module (TrustedSigning) with scope CurrentUser")
    try {
      await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", "Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser"])
    } catch (error: any) {
      log.debug({ message: error.message || error.stack }, "unable to install PackageProvider NuGet — may already be present")
    }
    await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", "Install-Module -Name TrustedSigning -MinimumVersion 0.5.0 -Force -Repository PSGallery -Scope CurrentUser"])
  }

  computePublisherName(): Promise<string> {
    return Promise.resolve(this.signing.publisherName)
  }

  readonly cscInfo = new MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>(
    () => this.packager.platformOptions,
    _selected => Promise.resolve(null)
  )

  async signFile(options: WindowsSignOptions): Promise<boolean> {
    return this.isLegacyMode() ? this.signFileLegacy(options) : this.signFileWithDlib(options)
  }

  private async signFileLegacy(options: WindowsSignOptions): Promise<boolean> {
    const { signing } = this
    const vm = await this.packager.vm.value
    const ps = await vm.powershellCommand.value

    const params: Record<string, string | undefined> = {
      Endpoint: signing.endpoint,
      CertificateProfileName: signing.certificateProfileName,
      CodeSigningAccountName: signing.codeSigningAccountName,
      TimestampRfc3161: signing.timestampRfc3161 ?? "http://timestamp.acs.microsoft.com",
      TimestampDigest: signing.timestampDigest ?? "SHA256",
      FileDigest: signing.fileDigest ?? "SHA256",
      ...signing.additionalMetadata,
      Files: vm.toVmFile(options.path),
    }

    const paramsString = Object.entries(params)
      .filter(([, value]) => value != null)
      .map(([field, value]) => `-${field} '${String(value).replace(/'/g, "''")}'`)
      .join(" ")

    await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", `Invoke-TrustedSigning ${paramsString}`])
    return true
  }

  private async signFileWithDlib(options: WindowsSignOptions): Promise<boolean> {
    const { signing } = this
    const winCodeSign = this.packager.config.toolsets!.winCodeSign!

    const arch = process.arch === "x64" ? Arch.x64 : process.arch === "arm64" ? Arch.arm64 : Arch.ia32
    const { kit: kitDir } = await getWindowsKitsBundle({ winCodeSign, arch })
    const signtoolPath = path.resolve(kitDir, "signtool.exe")
    const dlibPath = path.resolve(kitDir, "Azure.CodeSigning.Dlib.dll")

    const metadataPath = await this.packager.getTempFile(".json")
    await _fsExtra.writeJson(metadataPath, {
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
