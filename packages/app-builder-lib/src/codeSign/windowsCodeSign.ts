import { InvalidConfigurationError, asArray, log } from "builder-util/out/util"
import { getBin } from "../binDownload"
import { executeAppBuilderAsJson } from "../util/appBuilder"
import { computeToolEnv, ToolInfo } from "../util/bundledTool"
import { rename } from "fs-extra"
import * as os from "os"
import * as path from "path"
import { WindowsConfiguration } from ".."
import { resolveFunction } from "../platformPackager"
import { isUseSystemSigncode } from "../util/flags"
import { VmManager } from "../vm/vm"
import { WinPackager } from "../winPackager"

export function getSignVendorPath() {
  return getBin("winCodeSign")
}

export type CustomWindowsSign = (configuration: CustomWindowsSignTaskConfiguration) => Promise<any>

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

export async function sign(options: WindowsSignOptions, packager: WinPackager) {
  let hashes = options.options.signingHashAlgorithms
  // msi does not support dual-signing
  if (options.path.endsWith(".msi")) {
    hashes = [hashes != null && !hashes.includes("sha1") ? "sha256" : "sha1"]
  }
  else if (options.path.endsWith(".appx")) {
    hashes = ["sha256"]
  }
  else if (hashes == null) {
    hashes = ["sha1", "sha256"]
  }
  else {
    hashes = Array.isArray(hashes) ? hashes : [hashes]
  }

  function defaultExecutor(configuration: CustomWindowsSignTaskConfiguration) {
    return doSign(configuration, packager)
  }

  const executor = resolveFunction(options.options.sign, "sign") || defaultExecutor
  let isNest = false
  for (const hash of hashes) {
    const taskConfiguration: WindowsSignTaskConfiguration = {...options, hash, isNest}
    await executor({
      ...taskConfiguration,
      computeSignToolArgs: isWin => computeSignToolArgs(taskConfiguration, isWin)
    })
    isNest = true
    if (taskConfiguration.resultOutputPath != null) {
      await rename(taskConfiguration.resultOutputPath, options.path)
    }
  }
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
  }
  catch (e) {
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
  const certificateSubjectName = options.certificateSubjectName
  const certificateSha1 = options.certificateSha1
  // ExcludeProperty doesn't work, so, we cannot exclude RawData, it is ok
  // powershell can return object if the only item
  const rawResult = await vm.exec("powershell.exe", ["Get-ChildItem -Recurse Cert: -CodeSigningCert | Select-Object -Property Subject,PSParentPath,Thumbprint | ConvertTo-Json -Compress"])
  const certList = rawResult.length === 0 ? [] : asArray<CertInfo>(JSON.parse(rawResult))
  for (const certInfo of certList) {
    if (certificateSubjectName != null) {
      if (!certInfo.Subject.includes(certificateSubjectName)) {
        continue
      }
    }
    else if (certInfo.Thumbprint !== certificateSha1) {
      continue
    }

    const parentPath = certInfo.PSParentPath
    const store = parentPath.substring(parentPath.lastIndexOf("\\") + 1)
    log.debug({store, PSParentPath: parentPath}, "auto-detect certificate store")
    // https://github.com/electron-userland/electron-builder/issues/1717
    const isLocalMachineStore = (parentPath.includes("Certificate::LocalMachine"))
    log.debug(null, "auto-detect using of LocalMachine store")
    return {
      thumbprint: certInfo.Thumbprint,
      subject: certInfo.Subject,
      store,
      isLocalMachineStore
    }
  }

  throw new Error(`Cannot find certificate ${certificateSubjectName || certificateSha1}, all certs: ${rawResult}`)
}

async function doSign(configuration: CustomWindowsSignTaskConfiguration, packager: WinPackager) {
  // https://github.com/electron-userland/electron-builder/pull/1944
  const timeout = parseInt(process.env.SIGNTOOL_TIMEOUT as any, 10) || 10 * 60 * 1000

  let tool: string
  let args: Array<string>
  let env = process.env
  let vm: VmManager
  if (configuration.path.endsWith(".appx") || !("file" in configuration.cscInfo!!) /* certificateSubjectName and other such options */) {
    vm = await packager.vm.value
    tool = getWinSignTool(await getSignVendorPath())
    args = computeSignToolArgs(configuration, true, vm)
  }
  else {
    vm = new VmManager()
    const toolInfo = await getToolPath()
    tool = toolInfo.path
    args = configuration.computeSignToolArgs(process.platform === "win32")
    if (toolInfo.env != null) {
      env = toolInfo.env
    }
  }

  try {
    await vm.exec(tool, args, {timeout, env})
  }
  catch (e) {
    if (e.message.includes("The file is being used by another process") || e.message.includes("The specified timestamp server either could not be reached")) {
      log.warn(`First attempt to code sign failed, another attempt will be made in 2 seconds: ${e.message}`)
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          vm.exec(tool, args, {timeout, env})
            .then(resolve)
            .catch(reject)
        }, 2000)
      })
    }
    throw e
  }
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
    const timestampingServiceUrl = options.options.timeStampServer || "http://timestamp.digicert.com"
    if (isWin) {
      args.push(options.isNest || options.hash === "sha256" ? "/tr" : "/t", options.isNest || options.hash === "sha256" ? (options.options.rfc3161TimeStampServer || "http://timestamp.comodoca.com/rfc3161") : timestampingServiceUrl)
    }
    else {
      args.push("-t", timestampingServiceUrl)
    }
  }

  const certificateFile = (options.cscInfo as FileCodeSigningInfo).file
  if (certificateFile == null) {
    const cscInfo = (options.cscInfo as CertificateFromStoreInfo)
    const subjectName = cscInfo.thumbprint
    if (!isWin) {
      throw new Error(`${subjectName == null ? "certificateSha1" : "certificateSubjectName"} supported only on Windows`)
    }

    args.push("/sha1", cscInfo.thumbprint)
    args.push("/s", cscInfo.store)
    if (cscInfo.isLocalMachineStore) {
      args.push("/sm")
    }
  }
  else {
    const certExtension = path.extname(certificateFile)
    if (certExtension === ".p12" || certExtension === ".pfx") {
      args.push(isWin ? "/f" : "-pkcs12", vm.toVmFile(certificateFile))
    }
    else {
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

  if (options.options.additionalCertificateFile) {
    args.push(isWin ? "/ac" : "-ac", vm.toVmFile(options.options.additionalCertificateFile))
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
  }
  else {
    return path.join(vendorPath, "windows-10", process.arch, "signtool.exe")
  }
}

async function getToolPath(): Promise<ToolInfo> {
  if (isUseSystemSigncode()) {
    return {path: "osslsigncode"}
  }

  const result = process.env.SIGNTOOL_PATH
  if (result) {
    return {path: result}
  }

  const vendorPath = await getSignVendorPath()
  if (process.platform === "win32") {
    // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
    return {path: getWinSignTool(vendorPath)}
  }
  else if (process.platform === "darwin") {
    const toolDirPath = path.join(vendorPath, process.platform, "10.12")
    return {
      path: path.join(toolDirPath, "osslsigncode"),
      env: computeToolEnv([path.join(toolDirPath, "lib")]),
    }
  }
  else {
    return {path: path.join(vendorPath, process.platform, "osslsigncode")}
  }
}
