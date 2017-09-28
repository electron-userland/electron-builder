import { exec, isMacOsSierra, warn } from "builder-util"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { computeToolEnv, ToolInfo } from "builder-util/out/bundledTool"
import { rename } from "fs-extra-p"
import isCi from "is-ci"
import * as os from "os"
import * as path from "path"
import { WindowsConfiguration } from "./options/winOptions"
import { resolveFunction } from "./platformPackager"
import { isUseSystemSigncode } from "./util/flags"
import { VmManager } from "./parallels"
import { Lazy } from "lazy-val"

export function getSignVendorPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("winCodeSign", "1.9.0", "cyhO9Mv5MTP2o9dwk/+qs0KvuO9CbDhjEJXA2ujpvhcsk5zmc+zY9iqiWXVzOuibTLYNC3qZiuFlJrrCT2kldw==")
}

export interface FileCodeSigningInfo {
  readonly file?: string | null
  readonly password?: string | null

  readonly subjectName?: string | null
  readonly certificateSha1?: string | null
}

export type CustomWindowsSign = (configuration: CustomWindowsSignTaskConfiguration) => Promise<any>

export interface WindowsSignOptions {
  readonly path: string

  readonly cert?: string | null

  readonly name?: string | null
  readonly password?: string | null
  readonly site?: string | null

  readonly options: WindowsConfiguration
}

export interface WindowsSignTaskConfiguration extends WindowsSignOptions {
  // set if output path differs from input (e.g. osslsigncode cannot sign file inplace)
  resultOutputPath?: string

  hash: string
  isNest: boolean
}

export interface CustomWindowsSignTaskConfiguration extends WindowsSignTaskConfiguration {
  computeSignToolArgs(isWin: boolean): Array<string>
}

export async function sign(options: WindowsSignOptions, vm?: Lazy<VmManager>) {
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
    return doSign(configuration, vm)
  }

  const executor = resolveFunction(options.options.sign) || defaultExecutor
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

async function doSign(configuration: CustomWindowsSignTaskConfiguration, vmPromise?: Lazy<VmManager>) {
  // https://github.com/electron-userland/electron-builder/pull/1944
  const timeout = parseInt(process.env.SIGNTOOL_TIMEOUT as any, 10) || 10 * 60 * 1000

  if (configuration.path.endsWith(".appx")) {
    const vm = await vmPromise!!.value
    const vendorPath = await getSignVendorPath()
    await vm.exec(path.join(vendorPath, "windows-10", process.arch, "signtool.exe"), computeSignToolArgs(configuration, true, vm), {
      timeout,
    })
    return
  }

  const toolInfo = await getToolPath()
  await exec(toolInfo.path, configuration.computeSignToolArgs(process.platform === "win32"), {
    timeout,
    env: toolInfo.env || process.env
  })
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
    const timestampingServiceUrl = options.options.timeStampServer || "http://timestamp.verisign.com/scripts/timstamp.dll"
    if (isWin) {
      args.push(options.isNest || options.hash === "sha256" ? "/tr" : "/t", options.isNest || options.hash === "sha256" ? (options.options.rfc3161TimeStampServer || "http://timestamp.comodoca.com/rfc3161") : timestampingServiceUrl)
    }
    else {
      args.push("-t", timestampingServiceUrl)
    }
  }

  const certificateFile = options.cert
  if (certificateFile == null) {
    const subjectName = options.options.certificateSubjectName
    if (!isWin) {
      throw new Error(`${subjectName == null ? "certificateSha1" : "certificateSubjectName"} supported only on Windows`)
    }

    if (subjectName == null) {
      args.push("/sha1", options.options.certificateSha1!)
    }
    else {
      args.push("/n", subjectName)
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

  if (options.password) {
    args.push(isWin ? "/p" : "-pass", options.password)
  }

  if (options.options.additionalCertificateFile) {
    args.push(isWin ? "/ac" : "-ac", vm.toVmFile(options.options.additionalCertificateFile))
  }

  if (isWin) {
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
    if (isOldWin6()) {
      return {path: path.join(vendorPath, "windows-6", "signtool.exe")}
    }
    else {
      return {path: path.join(vendorPath, "windows-10", process.arch, "signtool.exe")}
    }
  }
  else if (process.platform === "darwin") {
    let suffix: string | null = null
    try {
      if (await isMacOsSierra()) {
        const toolDirPath = path.join(vendorPath, process.platform, "10.12")
        return {
          path: path.join(toolDirPath, "osslsigncode"),
          env: computeToolEnv([path.join(toolDirPath, "lib")]),
        }
      }
      else if (isCi) {
        // not clear for what we do this instead of using version detection
        suffix = "ci"
      }
    }
    catch (e) {
      warn(`${e.stack || e}`)
    }
    return {path: path.join(vendorPath, process.platform, `${suffix == null ? "" : `${suffix}/`}osslsigncode`)}
  }
  else {
    return {path: path.join(vendorPath, process.platform, "osslsigncode")}
  }
}
