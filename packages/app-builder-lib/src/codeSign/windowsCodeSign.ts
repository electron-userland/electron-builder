import { InvalidConfigurationError, asArray, log, retry } from "builder-util"
import { getBin } from "../binDownload"
import { WindowsAzureSigningConfiguration, WindowsConfiguration } from "../options/winOptions"
import { executeAppBuilderAsJson } from "../util/appBuilder"
import { computeToolEnv, ToolInfo } from "../util/bundledTool"
import { rename } from "fs-extra"
import * as os from "os"
import * as path from "path"
import { resolveFunction } from "../util/resolve"
import { isUseSystemSigncode } from "../util/flags"
import { VmManager } from "../vm/vm"
import { WinPackager } from "../winPackager"
import { chooseNotNull } from "../platformPackager"

export function getSignVendorPath() {
  return getBin("winCodeSign")
}

export type CustomWindowsSign = (configuration: CustomWindowsSignTaskConfiguration, packager?: WinPackager) => Promise<any>

export interface WindowsSignOptions {
  readonly path: string

  readonly name?: string | null
  readonly cscInfo?: FileCodeSigningInfo | CertificateFromStoreInfo | null
  readonly site?: string | null

  readonly options: WindowsConfiguration
}

export interface WindowsSignTaskConfiguration extends WindowsSignOptions {
  // set if output path differs from input (e.g. osslsigncode cannot sign file in-place)
  resultOutputPath?: string

  hash: string
  isNest: boolean
}

export interface CustomWindowsSignTaskConfiguration extends WindowsSignTaskConfiguration {
  computeSignToolArgs(isWin: boolean): Array<string>
}

export async function sign(options: WindowsSignOptions, packager: WinPackager): Promise<boolean> {
  if (options.options.azureOptions) {
    log.info(null, "signing with Azure Trusted Signing")
    ;[
      "AZURE_TENANT_ID",
      "AZURE_CLIENT_ID",
      "AZURE_CLIENT_SECRET",
      "AZURE_CLIENT_CERTIFICATE_PATH",
      "AZURE_CLIENT_SEND_CERTIFICATE_CHAIN",
      "AZURE_USERNAME",
      "AZURE_PASSWORD",
    ].forEach(envVar => {
      if (!process.env[envVar]) {
        throw new InvalidConfigurationError(`Unable to find valid azure env var. Please set ${envVar}`)
      }
    })
    return signUsingAzureTrustedSigning(options, packager)
  }

  log.info(null, "signing with signtool.exe")
  const deprecatedFields = {
    sign: options.options.sign,
    signDlls: options.options.signDlls,
    signingHashAlgorithms: options.options.signingHashAlgorithms,
    certificateFile: options.options.certificateFile,
    certificatePassword: options.options.certificatePassword,
    certificateSha1: options.options.certificateSha1,
    certificateSubjectName: options.options.certificateSubjectName,
    additionalCertificateFile: options.options.additionalCertificateFile,
    rfc3161TimeStampServer: options.options.rfc3161TimeStampServer,
    timeStampServer: options.options.timeStampServer,
  }
  Object.entries(deprecatedFields).forEach((field, value) => {
    if (value) {
      log.info({ field }, `deprecated field. Please move to win.signtoolOptions.${field}`)
    }
  })
  return signUsingSigntool(options, packager)
}

export async function signUsingSigntool(options: WindowsSignOptions, packager: WinPackager): Promise<boolean> {
  let hashes = chooseNotNull(options.options.signtoolOptions?.signingHashAlgorithms, options.options.signingHashAlgorithms)
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

  const executor = (await resolveFunction(packager.appInfo.type, chooseNotNull(options.options.signtoolOptions?.sign, options.options.sign), "sign")) || doSign
  let isNest = false
  for (const hash of hashes) {
    const taskConfiguration: WindowsSignTaskConfiguration = { ...options, hash, isNest }
    await Promise.resolve(
      executor(
        {
          ...taskConfiguration,
          computeSignToolArgs: isWin => computeSignToolArgs(taskConfiguration, isWin),
        },
        packager
      )
    )
    isNest = true
    if (taskConfiguration.resultOutputPath != null) {
      await rename(taskConfiguration.resultOutputPath, options.path)
    }
  }

  return true
}

export async function signUsingAzureTrustedSigning(options: WindowsSignOptions, packager: WinPackager): Promise<boolean> {
  const vm = await packager.vm.value

  const ps = await getPSCmd(vm)
  await vm.exec(ps, ["Install-Module", "-Name", "TrustedSigning", "-RequiredVersion", "0.4.1", "-Force", "-Repository", "PSGallery"])

  const config: WindowsAzureSigningConfiguration = options.options.azureOptions!

  const configFilter = config.FilesFolderFilter?.split(",") ?? []
  const signExts = new Set(["exe", ...configFilter])
  if (options.options.signDlls === true) {
    signExts.add("dll")
  }
  if (options.options.signExts) {
    options.options.signExts.forEach(v => signExts.add(v))
  }

  const params = {
    ...config,
    FilesFolder: options.path,
    FilesFolderFilter: Array.from(signExts)
      .filter(v => !!v.trim())
      .map(v => (v.at(0) === "." ? v.substring(1) : v)) // Signing expects extensions to not start with "."
      .join(","),
  }
  const paramsString = Object.entries(params)
    .map((key, value) => ` -${key} ${value}`)
    .join("")
  await vm.exec(ps, ["Invoke-TrustedSigning", paramsString])

  return true
}

export interface FileCodeSigningInfo {
  readonly file: string
  readonly password: string | null
}

export async function getCertInfo(file: string, password: string): Promise<CertificateInfo> {
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

export async function getCertificateFromStoreInfo(options: WindowsConfiguration, vm: VmManager): Promise<CertificateFromStoreInfo> {
  const certificateSubjectName = chooseNotNull(options.signtoolOptions?.certificateSubjectName, options.certificateSubjectName)
  const certificateSha1 = chooseNotNull(options.signtoolOptions?.certificateSha1, options.certificateSha1)?.toUpperCase()

  const ps = await getPSCmd(vm)
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

export async function doSign(configuration: CustomWindowsSignTaskConfiguration, packager: WinPackager) {
  // https://github.com/electron-userland/electron-builder/pull/1944
  const timeout = parseInt(process.env.SIGNTOOL_TIMEOUT as any, 10) || 10 * 60 * 1000
  // decide runtime argument by cases
  let args: Array<string>
  let env = process.env
  let vm: VmManager
  const vmRequired = configuration.path.endsWith(".appx") || !("file" in configuration.cscInfo!) /* certificateSubjectName and other such options */
  const isWin = process.platform === "win32" || vmRequired
  const toolInfo = await getToolPath(isWin)
  const tool = toolInfo.path
  if (vmRequired) {
    vm = await packager.vm.value
    args = computeSignToolArgs(configuration, isWin, vm)
  } else {
    vm = new VmManager()
    args = configuration.computeSignToolArgs(isWin)
    if (toolInfo.env != null) {
      env = toolInfo.env
    }
  }

  await retry(
    () => vm.exec(tool, args, { timeout, env }),
    2,
    15000,
    10000,
    0,
    (e: any) => {
      if (e.message.includes("The file is being used by another process") || e.message.includes("The specified timestamp server either could not be reached")) {
        log.warn(`Attempt to code sign failed, another attempt will be made in 15 seconds: ${e.message}`)
        return true
      }
      return false
    }
  )
}

interface CertInfo {
  Subject: string
  Thumbprint: string
  PSParentPath: string
}

// on windows be aware of http://stackoverflow.com/a/32640183/1910191
function computeSignToolArgs(options: WindowsSignTaskConfiguration, isWin: boolean, vm: VmManager = new VmManager()): Array<string> {
  const inputFile = vm.toVmFile(options.path)
  const outputPath = isWin ? inputFile : getOutputPath(inputFile, options.hash)
  if (!isWin) {
    options.resultOutputPath = outputPath
  }

  const args = isWin ? ["sign"] : ["-in", inputFile, "-out", outputPath]

  if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
    const timestampingServiceUrl = chooseNotNull(options.options.signtoolOptions?.timeStampServer, options.options.timeStampServer) || "http://timestamp.digicert.com"
    if (isWin) {
      args.push(
        options.isNest || options.hash === "sha256" ? "/tr" : "/t",
        options.isNest || options.hash === "sha256"
          ? chooseNotNull(options.options.signtoolOptions?.rfc3161TimeStampServer, options.options.rfc3161TimeStampServer) || "http://timestamp.digicert.com"
          : timestampingServiceUrl
      )
    } else {
      args.push("-t", timestampingServiceUrl)
    }
  }

  const certificateFile = (options.cscInfo as FileCodeSigningInfo).file
  if (certificateFile == null) {
    const cscInfo = options.cscInfo as CertificateFromStoreInfo
    const subjectName = cscInfo.thumbprint
    if (!isWin) {
      throw new Error(`${subjectName == null ? "certificateSha1" : "certificateSubjectName"} supported only on Windows`)
    }

    args.push("/sha1", cscInfo.thumbprint)
    args.push("/s", cscInfo.store)
    if (cscInfo.isLocalMachineStore) {
      args.push("/sm")
    }
  } else {
    const certExtension = path.extname(certificateFile)
    if (certExtension === ".p12" || certExtension === ".pfx") {
      args.push(isWin ? "/f" : "-pkcs12", vm.toVmFile(certificateFile))
    } else {
      throw new Error(`Please specify pkcs12 (.p12/.pfx) file, ${certificateFile} is not correct`)
    }
  }

  if (!isWin || options.hash !== "sha1") {
    args.push(isWin ? "/fd" : "-h", options.hash)
    if (isWin && process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      args.push("/td", "sha256")
    }
  }

  if (options.name) {
    args.push(isWin ? "/d" : "-n", options.name)
  }

  if (options.site) {
    args.push(isWin ? "/du" : "-i", options.site)
  }

  // msi does not support dual-signing
  if (options.isNest) {
    args.push(isWin ? "/as" : "-nest")
  }

  const password = options.cscInfo == null ? null : (options.cscInfo as FileCodeSigningInfo).password
  if (password) {
    args.push(isWin ? "/p" : "-pass", password)
  }

  const additionalCert = chooseNotNull(options.options.signtoolOptions?.additionalCertificateFile, options.options.additionalCertificateFile)
  if (additionalCert) {
    args.push(isWin ? "/ac" : "-ac", vm.toVmFile(additionalCert))
  }

  const httpsProxyFromEnv = process.env.HTTPS_PROXY
  if (!isWin && httpsProxyFromEnv != null && httpsProxyFromEnv.length) {
    args.push("-p", httpsProxyFromEnv)
  }

  if (isWin) {
    // https://github.com/electron-userland/electron-builder/issues/2875#issuecomment-387233610
    args.push("/debug")
    // must be last argument
    args.push(inputFile)
  }

  return args
}

function getOutputPath(inputPath: string, hash: string) {
  const extension = path.extname(inputPath)
  return path.join(path.dirname(inputPath), `${path.basename(inputPath, extension)}-signed-${hash}${extension}`)
}

/** @internal */
export function isOldWin6() {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}

function getWinSignTool(vendorPath: string): string {
  // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
  if (isOldWin6()) {
    return path.join(vendorPath, "windows-6", "signtool.exe")
  } else {
    return path.join(vendorPath, "windows-10", process.arch, "signtool.exe")
  }
}

async function getToolPath(isWin = process.platform === "win32"): Promise<ToolInfo> {
  if (isUseSystemSigncode()) {
    return { path: "osslsigncode" }
  }

  const result = process.env.SIGNTOOL_PATH
  if (result) {
    return { path: result }
  }

  const vendorPath = await getSignVendorPath()
  if (isWin) {
    // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
    return { path: getWinSignTool(vendorPath) }
  } else if (process.platform === "darwin") {
    const toolDirPath = path.join(vendorPath, process.platform, "10.12")
    return {
      path: path.join(toolDirPath, "osslsigncode"),
      env: computeToolEnv([path.join(toolDirPath, "lib")]),
    }
  } else {
    return { path: path.join(vendorPath, process.platform, "osslsigncode") }
  }
}

async function getPSCmd(vm: VmManager): Promise<string> {
  return await vm
    .exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-Command pwsh.exe`])
    .then(() => {
      log.debug(null, "identified pwsh.exe for executing code signing")
      return "pwsh.exe"
    })
    .catch(() => {
      log.debug(null, "unable to find pwsh.exe, falling back to powershell.exe")
      return "powershell.exe"
    })
}
