import { asArray, InvalidConfigurationError, log, retry } from "builder-util"
import { MemoLazy, parseDn } from "builder-util-runtime"
import _fsExtra from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../../core.js"
import {
  resolveWindowsSigningConfiguration,
  WindowsConfiguration,
  WindowsHsmSigningConfig,
  WindowsSigntoolFamilyConfig,
  WindowsSigntoolSigningConfig,
} from "../../options/winOptions.js"
import AppXTarget from "../../targets/win/AppxTarget.js"
import MsixTarget from "../../targets/win/MsixTarget.js"
import { getSignToolPath } from "../../toolsets/winCodeSign.js"
import { ToolInfo } from "../../util/bundledTool.js"
import { resolveFunction } from "../../util/resolve.js"
import { withSigntoolLock } from "../../util/toolsetLock.js"
import { readCertInfo, readCertInfoFromX509 } from "../certInfo.js"
import { VmManager } from "../../vm/vm.js"
import type { WinPackager } from "../../winPackager.js"
import { importCertificate } from "../codesign.js"
import type { SignManager } from "./signManager.js"
import { WindowsSignOptions } from "./windowsCodeSign.js"
const { rename } = _fsExtra

export type CustomWindowsSign = (configuration: CustomWindowsSignTaskConfiguration, packager?: WinPackager) => Promise<any>

export interface WindowsSignToolOptions extends WindowsSignOptions {
  readonly name: string
  readonly site: string | null
}

export interface FileCodeSigningInfo {
  readonly file: string
  readonly password: string | null
}

export interface WindowsSignTaskConfiguration extends WindowsSignToolOptions {
  readonly cscInfo: FileCodeSigningInfo | CertificateFromStoreInfo | null

  // set if output path differs from input (e.g. osslsigncode cannot sign file in-place)
  resultOutputPath?: string

  hash: string
  isNest: boolean
}

export interface CustomWindowsSignTaskConfiguration extends WindowsSignTaskConfiguration {
  computeSignToolArgs(isWin: boolean): Array<string>
}

export interface CertificateInfo {
  readonly commonName: string
  readonly bloodyMicrosoftSubjectDn: string
}

export interface CertificateFromStoreInfo {
  thumbprint: string
  subject: string
  store: string
  isLocalMachineStore: boolean
}

interface CertInfo {
  Subject: string
  Thumbprint: string
  PSParentPath: string
}

/** Extracts the non-Azure signing config from WindowsConfiguration, or null for Azure/unset/disabled. */
export function getSigntoolFamilyConfig(config: WindowsConfiguration): WindowsSigntoolFamilyConfig | null {
  const s = resolveWindowsSigningConfiguration(config)
  if (s == null || s.type === "azure") {
    return null
  }
  return s
}

export abstract class SigntoolBaseSignManager implements SignManager {
  protected readonly platformSpecificBuildOptions: WindowsConfiguration

  constructor(protected readonly packager: WinPackager) {
    this.platformSpecificBuildOptions = packager.platformOptions
  }

  readonly computedPublisherName = new Lazy<Array<string> | null>(async () => {
    const signing = getSigntoolFamilyConfig(this.platformSpecificBuildOptions)
    const publisherName = signing?.publisherName
    if (publisherName === null) {
      return null
    } else if (publisherName != null) {
      return asArray(publisherName)
    }

    const certInfo = await this.lazyCertInfo.value
    return certInfo == null ? null : [certInfo.commonName]
  })

  readonly lazyCertInfo = new MemoLazy<MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>, CertificateInfo | null>(
    () => this.cscInfo,
    async csc => {
      const cscInfo = await csc.value
      if (cscInfo == null) {
        return null
      }

      if ("subject" in cscInfo) {
        const bloodyMicrosoftSubjectDn = cscInfo.subject
        return {
          commonName: parseDn(bloodyMicrosoftSubjectDn).get("CN")!,
          bloodyMicrosoftSubjectDn,
        }
      }

      const cscFile = cscInfo.file
      if (cscFile == null) {
        return null
      }

      const certExt = path.extname(cscFile).toLowerCase()
      if (certExt === ".p12" || certExt === ".pfx") {
        return await this.getCertInfo(cscFile, cscInfo.password || "")
      }
      // Non-PKCS12 files (.crt, .cer): parse as plain X.509.
      // Returns null when the CN is absent — caller must set publisherName explicitly.
      return await readCertInfoFromX509(cscFile)
    }
  )

  readonly cscInfo = new MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>(
    () => this.platformSpecificBuildOptions,
    platformSpecificBuildOptions => {
      const signing = getSigntoolFamilyConfig(platformSpecificBuildOptions)
      // signtool is the implicit default when win.sign is unset, so an absent config still
      // honours the WIN_CSC_LINK/cscLink fallback below (hsm/pkcs11 set signing.type explicitly).
      const isSigntool = signing == null || signing.type === "signtool"

      // signtool + hsm: store-based cert takes priority
      const subjectName = (signing as WindowsSigntoolSigningConfig | WindowsHsmSigningConfig | null)?.certificateSubjectName
      const shaType = (signing as WindowsSigntoolSigningConfig | WindowsHsmSigningConfig | null)?.certificateSha1
      if (subjectName != null || shaType != null) {
        return this.packager.vm.value
          .then(vm => this.getCertificateFromStoreInfo(platformSpecificBuildOptions, vm))
          .catch((e: any) => {
            // https://github.com/electron-userland/electron-builder/pull/2397
            if (signing?.sign == null) {
              throw e
            } else {
              log.debug({ error: e }, "getCertificateFromStoreInfo error")
              return null
            }
          })
      }

      const certificateFile = signing?.certificateFile
      if (certificateFile != null) {
        // Only signtool mode uses a password (HSM private key lives in the HSM, not the cert file)
        const certificatePassword = isSigntool ? this.packager.getCscPassword() : null
        return Promise.resolve({
          file: certificateFile,
          password: certificatePassword == null ? null : certificatePassword.trim(),
        })
      }

      // WIN_CSC_LINK env var fallback: only for signtool mode (including the implicit default)
      if (isSigntool) {
        const cscLink = this.packager.getCscLink("WIN_CSC_LINK")
        if (cscLink == null || cscLink === "") {
          return Promise.resolve(null)
        }

        return importCertificate(cscLink, this.packager.tempDirManager, this.packager.projectDir)
          .catch((e: any) => {
            if (e instanceof InvalidConfigurationError) {
              throw new InvalidConfigurationError(`Env WIN_CSC_LINK is not correct, cannot resolve: ${e.message}`)
            } else {
              throw e
            }
          })
          .then(p => ({
            file: p,
            password: this.packager.getCscPassword(),
          }))
      }

      return Promise.resolve(null)
    }
  )

  initialize(): Promise<void> {
    return Promise.resolve()
  }

  // https://github.com/electron-userland/electron-builder/issues/2108#issuecomment-333200711
  async computePublisherName(target: Target, publisherName: string | null) {
    if ((target instanceof AppXTarget || target instanceof MsixTarget) && (await this.cscInfo.value) == null) {
      log.info({ reason: "Windows Store only build" }, "AppX is not signed")
      return publisherName ?? "CN=ms"
    }

    // When a signing cert is available, the cert's subject MUST be used so the APPX package
    // Publisher attribute matches the certificate — any mismatch causes SignerSign to fail with
    // ERROR_BAD_FORMAT. Only honour a user-supplied publisherName if it was explicitly configured
    // (non-null); otherwise derive from the certificate.
    const certInfo = await this.lazyCertInfo.value
    const publisher = publisherName ?? certInfo?.bloodyMicrosoftSubjectDn ?? null
    if (publisher == null) {
      throw new Error("Internal error: cannot compute subject using certificate info")
    }
    return publisher
  }

  /**
   * Called when cscInfo is null. Returns true to skip signing, false to proceed, or throws.
   * Override in subclasses with different null-cert behaviour (HSM throws, PKCS#11 proceeds).
   */
  protected handleNullCscInfo(customSign: CustomWindowsSign | string | null | undefined): boolean {
    return !customSign // default: skip when no cert and no custom sign hook
  }

  async signFile(options: WindowsSignOptions): Promise<boolean> {
    const signing = getSigntoolFamilyConfig(options.options)
    let hashes = signing?.signingHashAlgorithms
    // msi does not support dual-signing
    if (options.path.endsWith(".msi")) {
      hashes = [hashes != null && !hashes.includes("sha1") ? "sha256" : "sha1"]
    } else if (options.path.endsWith(".appx") || options.path.endsWith(".msix") || options.path.endsWith(".msixbundle")) {
      hashes = ["sha256"]
    } else if (hashes == null) {
      hashes = ["sha1", "sha256"]
    } else {
      hashes = Array.isArray(hashes) ? hashes : [hashes]
    }

    const name = this.packager.appInfo.productName
    const site = await this.packager.appInfo.computePackageUrl()

    const customSign = await resolveFunction(this.packager.appInfo.type, signing?.sign, "sign", await this.packager.getWorkspaceRoot())

    const cscInfo = await this.cscInfo.value

    if (cscInfo) {
      let logInfo: any = {
        file: log.filePath(options.path),
      }
      if ("file" in cscInfo) {
        logInfo = { ...logInfo, certificateFile: cscInfo.file }
      } else {
        logInfo = {
          ...logInfo,
          subject: cscInfo.subject,
          thumbprint: cscInfo.thumbprint,
          store: cscInfo.store,
          user: cscInfo.isLocalMachineStore ? "local machine" : "current user",
        }
      }
      log.info(logInfo, "signing")
    } else if (this.handleNullCscInfo(customSign)) {
      log.debug({ signHook: !!customSign, cscInfo }, "no signing info identified, signing is skipped")
      return false
    }

    const executor = customSign || ((config: CustomWindowsSignTaskConfiguration, packager: WinPackager) => this.doSign(config, packager))
    let isNest = false
    for (const hash of hashes) {
      const taskConfiguration: WindowsSignTaskConfiguration = { ...options, name, site, cscInfo, hash, isNest }
      await Promise.resolve(
        executor(
          {
            ...taskConfiguration,
            computeSignToolArgs: isWin => this.computeSignToolArgs(taskConfiguration, isWin),
          },
          this.packager
        )
      )
      isNest = true
      if (taskConfiguration.resultOutputPath != null) {
        await rename(taskConfiguration.resultOutputPath, options.path)
      }
    }

    return true
  }

  async getCertInfo(file: string, password: string): Promise<CertificateInfo> {
    const errorMessagePrefix = "Cannot extract publisher name from code signing certificate. As workaround, set win.publisherName. Error: "
    try {
      return await readCertInfo(file, password)
    } catch (e: any) {
      throw new InvalidConfigurationError(`${errorMessagePrefix}${e.message || e}`)
    }
  }

  // on windows be aware of http://stackoverflow.com/a/32640183/1910191
  computeSignToolArgs(options: WindowsSignTaskConfiguration, isWin: boolean, vm: VmManager = new VmManager()): Array<string> {
    return isWin ? this.computeWindowsSignArgs(options, vm) : this.computeOsslsigncodeArgs(options, vm)
  }

  protected isLegacyToolset(): boolean {
    const v = this.packager.config.toolsets?.winCodeSign
    // Only an explicit "0.0.0" pin is legacy; unset / null / "latest" / custom now resolve to a modern bundle.
    return v === "0.0.0"
  }

  protected abstract computeWindowsSignArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string>
  protected abstract computeOsslsigncodeArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string>

  // allowX509: set to true by HsmSignManager to permit .crt/.cer (public chain only, key is in HSM).
  protected addCertificateArgs(args: Array<string>, options: WindowsSignTaskConfiguration, vm: VmManager, isWin: boolean, allowX509 = false): void {
    if (options.cscInfo == null) {
      throw new Error("No code signing certificate configured. Provide certificateFile, certificateSha1, or certificateSubjectName.")
    }
    const certificateFile = (options.cscInfo as FileCodeSigningInfo).file

    if (certificateFile == null) {
      // Certificate from store (Windows only)
      if (!isWin) {
        throw new Error("certificateSha1/certificateSubjectName supported only on Windows")
      }

      const cscInfo = options.cscInfo as CertificateFromStoreInfo
      args.push("/sha1", cscInfo.thumbprint)
      args.push("/s", cscInfo.store)
      if (cscInfo.isLocalMachineStore) {
        args.push("/sm")
      }
    } else {
      const certExtension = path.extname(certificateFile).toLowerCase()

      if (certExtension === ".p12" || certExtension === ".pfx") {
        args.push(isWin ? "/f" : "-pkcs12", vm.toVmFile(certificateFile))
      } else if (isWin && allowX509 && (certExtension === ".crt" || certExtension === ".cer")) {
        args.push("/f", vm.toVmFile(certificateFile))
      } else {
        throw new InvalidConfigurationError(`Please specify pkcs12 (.p12/.pfx) file, ${certificateFile} is not correct`)
      }
    }
  }

  protected addCommonSigningArgs(args: Array<string>, options: WindowsSignTaskConfiguration, vm: VmManager, isWin: boolean): void {
    if (options.name) {
      args.push(isWin ? "/d" : "-n", options.name)
    }

    if (options.site) {
      args.push(isWin ? "/du" : "-i", options.site)
    }

    if (options.isNest) {
      args.push(isWin ? "/as" : "-nest")
    }

    const password = (options.cscInfo as FileCodeSigningInfo)?.password
    if (password) {
      args.push(isWin ? "/p" : "-pass", password)
    }

    const signing = getSigntoolFamilyConfig(options.options)
    const additionalCert = signing?.additionalCertificateFile
    if (additionalCert) {
      args.push(isWin ? "/ac" : "-ac", vm.toVmFile(additionalCert))
    }
  }

  getOutputPath(inputPath: string, hash: string) {
    const extension = path.extname(inputPath)
    return path.join(path.dirname(inputPath), `${path.basename(inputPath, extension)}-signed-${hash}${extension}`)
  }

  async getCertificateFromStoreInfo(options: WindowsConfiguration, vm: VmManager): Promise<CertificateFromStoreInfo> {
    const signing = getSigntoolFamilyConfig(options) as WindowsSigntoolSigningConfig | WindowsHsmSigningConfig | null
    const certificateSubjectName = signing?.certificateSubjectName
    const certificateSha1 = signing?.certificateSha1?.toUpperCase()

    const ps = await vm.powershellCommand.value
    const rawResult = await vm.exec(ps, [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-ChildItem -Recurse Cert: -CodeSigningCert | Select-Object -Property Subject,PSParentPath,Thumbprint | ConvertTo-Json -Compress",
    ])
    const certList = rawResult.length === 0 ? [] : asArray<CertInfo>(JSON.parse(rawResult))
    for (const certInfo of certList) {
      if (
        (certificateSubjectName != null && !certInfo.Subject.includes(certificateSubjectName)) ||
        (certificateSha1 != null && certInfo.Thumbprint.toUpperCase() !== certificateSha1)
      ) {
        continue
      }

      const parentPath = certInfo.PSParentPath
      const store = parentPath.substring(parentPath.lastIndexOf("\\") + 1)
      log.debug({ store, PSParentPath: parentPath }, "auto-detect certificate store")
      // https://github.com/electron-userland/electron-builder/issues/1717
      const isLocalMachineStore = parentPath.includes("Certificate::LocalMachine")
      log.debug(null, "auto-detect using of LocalMachine store")
      return {
        thumbprint: certInfo.Thumbprint,
        subject: certInfo.Subject,
        store,
        isLocalMachineStore,
      }
    }

    throw new Error(`Cannot find certificate ${certificateSubjectName || certificateSha1}, all certs: ${rawResult}`)
  }

  async getToolPath(isWin = process.platform === "win32"): Promise<ToolInfo> {
    return getSignToolPath(this.packager.config.toolsets?.winCodeSign, isWin, this.packager.buildResourcesDir)
  }

  async doSign(configuration: CustomWindowsSignTaskConfiguration, packager: WinPackager) {
    // https://github.com/electron-userland/electron-builder/pull/1944
    const timeout = parseInt(process.env.SIGNTOOL_TIMEOUT as any, 10) || 10 * 60 * 1000
    let args: Array<string>
    let vm: VmManager
    // cscInfo can be null (e.g. PKCS#11 with no cert file); guard before using `in`.
    // CertificateFromStoreInfo (no `file` property) requires a Windows VM for cert-store lookup.
    const cscInfo = configuration.cscInfo
    const useVmIfNotOnWin = configuration.path.endsWith(".appx") || (cscInfo != null && !("file" in cscInfo))
    const isWin = process.platform === "win32" || useVmIfNotOnWin
    const toolInfo = await getSignToolPath(this.packager.config.toolsets?.winCodeSign, isWin, this.packager.buildResourcesDir)
    const tool = toolInfo.path
    if (useVmIfNotOnWin) {
      vm = await packager.vm.value
      args = this.computeSignToolArgs(configuration, isWin, vm)
    } else {
      vm = new VmManager()
      args = configuration.computeSignToolArgs(isWin)
    }

    // signtool.exe (`/f`) is not safe to run concurrently — it races on the shared per-user crypto store.
    // Serialize real-Windows signtool invocations across processes; osslsigncode (`!isWin`) is file-isolated.
    const execSign = () => vm.exec(tool, args, { timeout, env: { ...process.env, ...(toolInfo.env || {}) } })
    await retry(() => (isWin ? withSigntoolLock(execSign) : execSign()), {
      retries: 2,
      interval: 15000,
      backoff: 10000,
      shouldRetry: (e: any) => {
        if (
          e.message.includes("The file is being used by another process") ||
          e.message.includes("The specified timestamp server either could not be reached") ||
          e.message.includes("No certificates were found that met all the given criteria.") ||
          // Transient failure of SignerSignEx after cert selection, typically a concurrent-signtool race
          // on the per-user crypto store; the cross-process lock above makes this rare, retry covers the rest.
          e.message.includes("An error occurred while attempting to load the signing certificate")
        ) {
          log.warn(`Attempt to code sign failed, another attempt will be made in 15 seconds: ${e.message}`)
          return true
        }
        return false
      },
    })
  }
}

export class SigntoolSignManager extends SigntoolBaseSignManager {
  protected computeWindowsSignArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string> {
    const signing = getSigntoolFamilyConfig(options.options)

    const inputFile = vm.toVmFile(options.path)
    const args = ["sign"]

    // Timestamping
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      const isRfc3161 = options.isNest || options.hash === "sha256"
      args.push(isRfc3161 ? "/tr" : "/t")
      const timestampUrl = isRfc3161 ? signing?.rfc3161TimeStampServer || "http://timestamp.digicert.com" : signing?.timeStampServer || "http://timestamp.digicert.com"
      args.push(timestampUrl)
    }

    // Certificate
    this.addCertificateArgs(args, options, vm, true)

    // Hash algorithm
    if (this.isLegacyToolset()) {
      // Legacy v0.0.0: Only add /fd for non-SHA1 (original behavior)
      if (options.hash !== "sha1") {
        args.push("/fd", options.hash)
        if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
          args.push("/td", "sha256")
        }
      }
    } else {
      // Modern: Always add /fd (required by new Windows Kits)
      args.push("/fd", options.hash.toLowerCase())
      // Only add /td for RFC3161 timestamps (incompatible with /t)
      if (process.env.ELECTRON_BUILDER_OFFLINE !== "true" && (options.isNest || options.hash === "sha256")) {
        args.push("/td", "sha256")
      }
    }

    // Optional parameters
    this.addCommonSigningArgs(args, options, vm, true)

    // Windows-specific
    args.push("/debug")
    args.push(inputFile) // Must be last

    return args
  }

  protected computeOsslsigncodeArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string> {
    const signing = getSigntoolFamilyConfig(options.options)

    const inputFile = vm.toVmFile(options.path)
    const outputPath = this.getOutputPath(inputFile, options.hash)
    options.resultOutputPath = outputPath

    const args = ["sign", "-in", inputFile, "-out", outputPath]

    // Timestamping
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      const timestampUrl = signing?.timeStampServer || "http://timestamp.digicert.com"
      args.push("-t", timestampUrl)
    }

    // Certificate file
    this.addCertificateArgs(args, options, vm, false)

    // Hash algorithm
    args.push("-h", options.hash.toLowerCase())

    // Optional parameters (name, site, nest, password, additionalCert)
    this.addCommonSigningArgs(args, options, vm, false)

    // Proxy support
    const httpsProxy = process.env.HTTPS_PROXY
    if (httpsProxy?.length) {
      args.push("-p", httpsProxy)
    }

    return args
  }
}
