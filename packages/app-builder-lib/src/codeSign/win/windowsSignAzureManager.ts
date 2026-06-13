import { Arch, log, sanitizeDirPath } from "builder-util"
import { asArray, MemoLazy } from "builder-util-runtime"
import _fsExtra from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../../core.js"
import { resolveWindowsSigningConfiguration, WindowsAzureSigningConfig, WindowsConfiguration } from "../../options/winOptions.js"
import { getAtsBundleDir, getDotnetRuntimeDir, getWindowsKitsBundle } from "../../toolsets/winCodeSign.js"
import { VmManager } from "../../vm/vm.js"
import { WineVmManager } from "../../vm/WineVm.js"
import { WinPackager } from "../../winPackager.js"
import { SignManager } from "./signManager.js"
import { WindowsSignOptions } from "./windowsCodeSign.js"
import { CertificateFromStoreInfo, FileCodeSigningInfo } from "./windowsSignToolManager.js"
import semver from "semver"

const minimumWinCodeSignVersionForDlib = "1.3.0"
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
    const { winCodeSign: wcs = null } = this.packager.config.toolsets ?? {}
    if (typeof wcs === "string") {
      return semver.lt(wcs, minimumWinCodeSignVersionForDlib)
    }
    // null = built-in toolset not configured → legacy; ToolsetCustom object = user-managed → not legacy
    return wcs == null
  }

  async initialize(): Promise<void> {
    if (!this.isLegacyMode()) {
      return
    }

    const { winCodeSign: wcs = null } = this.packager.config.toolsets ?? {}
    const reason = typeof wcs === "string" ? `toolsets.winCodeSign "${wcs}" is below the minimum "${minimumWinCodeSignVersionForDlib}"` : `toolsets.winCodeSign is not set`
    log.info(
      { reason, guidance: `set toolsets.winCodeSign to "${minimumWinCodeSignVersionForDlib}" to use the faster signtool /dlib integration` },
      `Azure Trusted Signing: falling back to legacy PowerShell (Invoke-TrustedSigning)`
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

  computePublisherName(_target: Target, publisherName: string): Promise<string> {
    return Promise.resolve(this.signing.publisherName ?? publisherName)
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

    // The ATS payload (dlib + its dependency closure) ships x64/x86 only; the bundle's arm64
    // dir has no dlib. On arm64 hosts use the x64 signtool + dlib — x64 signtool runs under
    // Windows-on-ARM emulation natively, and under x64 Wine on macOS/Linux.
    const arch = process.arch === "ia32" ? Arch.ia32 : Arch.x64
    const { kit: kitDir } = await getWindowsKitsBundle({ winCodeSign, arch, resourcesDir: this.packager.buildResourcesDir })
    const safeKitDir = sanitizeDirPath(kitDir)
    const signtoolPath = path.join(safeKitDir, "signtool.exe")

    let dlibPath: string
    let dotnetRootPath: string | null = null

    if (typeof winCodeSign === "string") {
      // 1.3.0+: dlib ships in a separate ats-bundle with its full native dependency closure
      // (Ijwhost.dll, VC++ runtime, etc.). The .NET 8 framework is in a separate dotnet-runtime
      // bundle; DOTNET_ROOT tells Ijwhost where to find hostfxr.dll → shared framework.
      const safeAtsDir = sanitizeDirPath(await getAtsBundleDir(winCodeSign))
      dlibPath = path.join(safeAtsDir, arch === Arch.ia32 ? "x86" : "x64", "Azure.CodeSigning.Dlib.dll")
      dotnetRootPath = sanitizeDirPath(await getDotnetRuntimeDir(winCodeSign))
    } else {
      // Custom toolset: user provides the dlib alongside signtool in the kit dir.
      dlibPath = path.join(safeKitDir, "Azure.CodeSigning.Dlib.dll")
    }

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

    // DOTNET_ROOT: Ijwhost.dll (shipped in the ats-bundle) reads this env var to locate
    // hostfxr.dll. On Wine, toVmFile converts the host path to a Z:\ path that Wine resolves
    // back to the same location on the host filesystem.
    const execOptions = dotnetRootPath != null ? { env: { DOTNET_ROOT: this.vm.toVmFile(dotnetRootPath) } } : undefined
    await this.vm.exec(signtoolPath, args, execOptions)
    return true
  }
}
