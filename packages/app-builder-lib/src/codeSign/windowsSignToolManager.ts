import { asArray, InvalidConfigurationError, log, retry } from "builder-util"
import { MemoLazy, parseDn } from "builder-util-runtime"
import { rename } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../core"
import { WindowsConfiguration } from "../options/winOptions"
import AppXTarget from "../targets/AppxTarget"
import { executeAppBuilderAsJson } from "../util/appBuilder"
import { ToolInfo } from "../util/bundledTool"
import { isUseSystemSigncode } from "../util/flags"
import { resolveFunction } from "../util/resolve"
import { VmManager } from "../vm/vm"
import { WinPackager } from "../winPackager"
import { importCertificate } from "./codesign"
import { SignManager } from "./signManager"
import { WindowsSignOptions } from "./windowsCodeSign"
import { getOsslSigncodeBundle, getWindowsKitsBundle } from "../targets/tools"

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

export class WindowsSignToolManager implements SignManager {
  private readonly platformSpecificBuildOptions: WindowsConfiguration

  constructor(private readonly packager: WinPackager) {
    this.platformSpecificBuildOptions = packager.platformSpecificBuildOptions
  }

  readonly computedPublisherName = new Lazy<Array<string> | null>(async () => {
    const publisherName = this.platformSpecificBuildOptions.signtoolOptions?.publisherName
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
      return await this.getCertInfo(cscFile, cscInfo.password || "")
    }
  )

  readonly cscInfo = new MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>(
    () => this.platformSpecificBuildOptions,
    platformSpecificBuildOptions => {
      const subjectName = platformSpecificBuildOptions.signtoolOptions?.certificateSubjectName
      const shaType = platformSpecificBuildOptions.signtoolOptions?.certificateSha1
      if (subjectName != null || shaType != null) {
        return this.packager.vm.value
          .then(vm => this.getCertificateFromStoreInfo(platformSpecificBuildOptions, vm))
          .catch((e: any) => {
            // https://github.com/electron-userland/electron-builder/pull/2397
            if (platformSpecificBuildOptions.signtoolOptions?.sign == null) {
              throw e
            } else {
              log.debug({ error: e }, "getCertificateFromStoreInfo error")
              return null
            }
          })
      }

      const certificateFile = platformSpecificBuildOptions.signtoolOptions?.certificateFile
      if (certificateFile != null) {
        const certificatePassword = this.packager.getCscPassword()
        return Promise.resolve({
          file: certificateFile,
          password: certificatePassword == null ? null : certificatePassword.trim(),
        })
      }

      const cscLink = this.packager.getCscLink("WIN_CSC_LINK")
      if (cscLink == null || cscLink === "") {
        return Promise.resolve(null)
      }

      return (
        importCertificate(cscLink, this.packager.info.tempDirManager, this.packager.projectDir)
          // before then
          .catch((e: any) => {
            if (e instanceof InvalidConfigurationError) {
              throw new InvalidConfigurationError(`Env WIN_CSC_LINK is not correct, cannot resolve: ${e.message}`)
            } else {
              throw e
            }
          })
          .then(path => {
            return {
              file: path,
              password: this.packager.getCscPassword(),
            }
          })
      )
    }
  )

  initialize(): Promise<void> {
    return Promise.resolve()
  }

  // https://github.com/electron-userland/electron-builder/issues/2108#issuecomment-333200711
  async computePublisherName(target: Target, publisherName: string) {
    if (target instanceof AppXTarget && (await this.cscInfo.value) == null) {
      log.info({ reason: "Windows Store only build" }, "AppX is not signed")
      return publisherName || "CN=ms"
    }

    const certInfo = await this.lazyCertInfo.value
    const publisher = publisherName || (certInfo == null ? null : certInfo.bloodyMicrosoftSubjectDn)
    if (publisher == null) {
      throw new Error("Internal error: cannot compute subject using certificate info")
    }
    return publisher
  }

  async signFile(options: WindowsSignOptions): Promise<boolean> {
    let hashes = options.options.signtoolOptions?.signingHashAlgorithms
    // msi does not support dual-signing
    if (options.path.endsWith(".msi")) {
      hashes = [hashes != null && !hashes.includes("sha1") ? "sha256" : "sha1"]
    } else if (options.path.endsWith(".appx")) {
      hashes = ["sha256"]
    } else if (hashes == null) {
      hashes = ["sha1", "sha256"]
    } else {
      hashes = Array.isArray(hashes) ? hashes : [hashes]
    }

    const name = this.packager.appInfo.productName
    const site = await this.packager.appInfo.computePackageUrl()

    const customSign = await resolveFunction(this.packager.appInfo.type, options.options.signtoolOptions?.sign, "sign")

    const cscInfo = await this.cscInfo.value
    if (cscInfo) {
      let logInfo: any = {
        file: log.filePath(options.path),
      }
      if ("file" in cscInfo) {
        logInfo = {
          ...logInfo,
          certificateFile: cscInfo.file,
        }
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
    } else if (!customSign) {
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
    let result: any = null
    const errorMessagePrefix = "Cannot extract publisher name from code signing certificate. As workaround, set win.publisherName. Error: "
    try {
      result = await executeAppBuilderAsJson<any>(["certificate-info", "--input", file, "--password", password])
    } catch (e: any) {
      throw new Error(`${errorMessagePrefix}${e.stack || e}`)
    }

    if (result.error != null) {
      // noinspection ExceptionCaughtLocallyJS
      throw new InvalidConfigurationError(`${errorMessagePrefix}${result.error}`)
    }
    return result
  }

  // on windows be aware of http://stackoverflow.com/a/32640183/1910191
  computeSignToolArgs(options: WindowsSignTaskConfiguration, isWin: boolean, vm: VmManager = new VmManager()): Array<string> {
    return isWin ? this.computeWindowsSignArgs(options, vm) : this.computeOsslsigncodeArgs(options, vm)
  }

  private computeWindowsSignArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string> {
    const inputFile = vm.toVmFile(options.path)
    const args = ["sign"]

    // Timestamping
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      const isRfc3161 = options.isNest || options.hash === "sha256"
      args.push(isRfc3161 ? "/tr" : "/t")

      const timestampUrl = isRfc3161
        ? options.options.signtoolOptions?.rfc3161TimeStampServer || "http://timestamp.digicert.com"
        : options.options.signtoolOptions?.timeStampServer || "http://timestamp.digicert.com"
      args.push(timestampUrl)
    }

    // Certificate
    this.addCertificateArgs(args, options, vm, true)

    // Hash algorithm
    args.push("/fd", options.hash.toLowerCase())
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true" && !args.includes("/t")) {
      args.push("/td", "sha256")
    }

    // Optional parameters
    this.addCommonSigningArgs(args, options, vm, true)

    // Windows-specific
    args.push("/debug")
    args.push(inputFile) // Must be last

    return args
  }

  private computeOsslsigncodeArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string> {
    const inputFile = vm.toVmFile(options.path)
    const outputPath = this.getOutputPath(inputFile, options.hash)
    options.resultOutputPath = outputPath

    const args = ["sign", "-in", inputFile, "-out", outputPath]

    // Timestamping
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      const timestampUrl = options.options.signtoolOptions?.timeStampServer || "http://timestamp.digicert.com"
      args.push("-t", timestampUrl)
    }

    // Certificate
    this.addCertificateArgs(args, options, vm, false)

    // Hash algorithm
    args.push("-h", options.hash.toLowerCase())

    // Optional parameters
    this.addCommonSigningArgs(args, options, vm, false)

    // Proxy support
    const httpsProxy = process.env.HTTPS_PROXY
    if (httpsProxy?.length) {
      args.push("-p", httpsProxy)
    }

    return args
  }

  private addCertificateArgs(args: Array<string>, options: WindowsSignTaskConfiguration, vm: VmManager, isWin: boolean): void {
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
      // Certificate file
      const certExtension = path.extname(certificateFile)
      if (certExtension === ".p12" || certExtension === ".pfx") {
        args.push(isWin ? "/f" : "-pkcs12", vm.toVmFile(certificateFile))
      } else {
        throw new Error(`Please specify pkcs12 (.p12/.pfx) file, ${certificateFile} is not correct`)
      }
    }
  }

  private addCommonSigningArgs(args: Array<string>, options: WindowsSignTaskConfiguration, vm: VmManager, isWin: boolean): void {
    if (options.name) {
      args.push(isWin ? "/d" : "-n", `"${options.name}"`)
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

    const additionalCert = options.options.signtoolOptions?.additionalCertificateFile
    if (additionalCert) {
      args.push(isWin ? "/ac" : "-ac", vm.toVmFile(additionalCert))
    }
  }

  getOutputPath(inputPath: string, hash: string) {
    const extension = path.extname(inputPath)
    return path.join(path.dirname(inputPath), `${path.basename(inputPath, extension)}-signed-${hash}${extension}`)
  }

  async getToolPath(isWin = process.platform === "win32"): Promise<ToolInfo> {
    if (isUseSystemSigncode()) {
      return { path: "osslsigncode" }
    }

    const result = process.env.SIGNTOOL_PATH
    if (result) {
      return { path: result }
    }

    const isLegacyWindowsCodeSign = !(this.packager.config.win?.winCodeSign !== "0.0.0") // default to legacy 0.0.0
    if (isWin) {
      const vendorPath = await getWindowsKitsBundle({ useLegacy: isLegacyWindowsCodeSign, arch: process.arch })
      const signToolExePath = path.join(vendorPath.kit, "signtool.exe")
      return { path: signToolExePath }
    } else {
      const vendor = await getOsslSigncodeBundle({ useLegacy: isLegacyWindowsCodeSign })
      return { path: vendor.path, env: vendor.env }
    }
  }

  async getCertificateFromStoreInfo(options: WindowsConfiguration, vm: VmManager): Promise<CertificateFromStoreInfo> {
    const certificateSubjectName = options.signtoolOptions?.certificateSubjectName
    const certificateSha1 = options.signtoolOptions?.certificateSha1?.toUpperCase()

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

  async doSign(configuration: CustomWindowsSignTaskConfiguration, packager: WinPackager) {
    // https://github.com/electron-userland/electron-builder/pull/1944
    const timeout = parseInt(process.env.SIGNTOOL_TIMEOUT as any, 10) || 10 * 60 * 1000
    // decide runtime argument by cases
    let args: Array<string>
    let vm: VmManager
    const useVmIfNotOnWin = configuration.path.endsWith(".appx") || !("file" in configuration.cscInfo!) /* certificateSubjectName and other such options */
    const isWin = process.platform === "win32" || useVmIfNotOnWin
    const toolInfo = await this.getToolPath(isWin)
    const tool = toolInfo.path
    if (useVmIfNotOnWin) {
      vm = await packager.vm.value
      args = this.computeSignToolArgs(configuration, isWin, vm)
    } else {
      vm = new VmManager()
      args = configuration.computeSignToolArgs(isWin)
    }

    await retry(() => vm.exec(tool, args, { timeout, env: { ...process.env, ...(toolInfo.env || {}) } }), {
      retries: 2,
      interval: 15000,
      backoff: 10000,
      shouldRetry: (e: any) => {
        if (
          e.message.includes("The file is being used by another process") ||
          e.message.includes("The specified timestamp server either could not be reached") ||
          e.message.includes("No certificates were found that met all the given criteria.")
        ) {
          log.warn(`Attempt to code sign failed, another attempt will be made in 15 seconds: ${e.message}`)
          return true
        }
        return false
      },
    })
  }
}
