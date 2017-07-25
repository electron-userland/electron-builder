import { exec, isMacOsSierra, warn } from "electron-builder-util"
import { getBinFromGithub } from "electron-builder-util/out/binDownload"
import { computeToolEnv, ToolInfo } from "electron-builder-util/out/bundledTool"
import { rename } from "fs-extra-p"
import isCi from "is-ci"
import * as os from "os"
import * as path from "path"
import { WinBuildOptions } from "./options/winOptions"
import { isUseSystemSigncode } from "./util/flags"

/** @internal */
export function getSignVendorPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("winCodeSign", "1.9.0", "cyhO9Mv5MTP2o9dwk/+qs0KvuO9CbDhjEJXA2ujpvhcsk5zmc+zY9iqiWXVzOuibTLYNC3qZiuFlJrrCT2kldw==")
}

/** @internal */
export interface FileCodeSigningInfo {
  readonly file?: string | null
  readonly password?: string | null

  readonly subjectName?: string | null
  readonly certificateSha1?: string | null
}

export interface SignOptions {
  readonly path: string

  readonly cert?: string | null

  readonly name?: string | null
  readonly password?: string | null
  readonly site?: string | null

  readonly options: WinBuildOptions
}

/** @internal */
export async function sign(options: SignOptions) {
  let hashes = options.options.signingHashAlgorithms
  // msi does not support dual-signing
  if (options.path.endsWith(".msi")) {
    hashes = [hashes != null && !hashes.includes("sha1") ? "sha256" : "sha1"]
  }
  else if (options.path.endsWith(".appx")) {
    hashes = ["sha256"]
  }
  else {
    if (hashes == null) {
      hashes = ["sha1", "sha256"]
    }
    else {
      hashes = Array.isArray(hashes) ? hashes.slice() : [hashes]
    }
  }

  const isWin = process.platform === "win32"
  let nest = false
  //noinspection JSUnusedAssignment
  let outputPath = ""
  for (const hash of hashes) {
    outputPath = isWin ? options.path : getOutputPath(options.path, hash)
    await spawnSign(options, options.path, outputPath, hash, nest)
    nest = true
    if (!isWin) {
      await rename(outputPath, options.path)
    }
  }
}

// on windows be aware of http://stackoverflow.com/a/32640183/1910191
async function spawnSign(options: SignOptions, inputPath: string, outputPath: string, hash: string, nest: boolean) {
  const isWin = process.platform === "win32"
  const args = isWin ? ["sign"] : ["-in", inputPath, "-out", outputPath]

  if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
    const timestampingServiceUrl = options.options.timeStampServer || "http://timestamp.verisign.com/scripts/timstamp.dll"
    if (isWin) {
      args.push(nest || hash === "sha256" ? "/tr" : "/t", nest || hash === "sha256" ? (options.options.rfc3161TimeStampServer || "http://timestamp.comodoca.com/rfc3161") : timestampingServiceUrl)
    }
    else {
      args.push("-t", timestampingServiceUrl)
    }
  }

  const certificateFile = options.cert
  if (certificateFile == null) {
    const subjectName = options.options.certificateSubjectName
    if (process.platform !== "win32") {
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
      args.push(isWin ? "/f" : "-pkcs12", certificateFile)
    }
    else {
      throw new Error(`Please specify pkcs12 (.p12/.pfx) file, ${certificateFile} is not correct`)
    }
  }

  if (!isWin || hash !== "sha1") {
    args.push(isWin ? "/fd" : "-h", hash)
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
  if (nest) {
    args.push(isWin ? "/as" : "-nest")
  }

  if (options.password) {
    args.push(isWin ? "/p" : "-pass", options.password)
  }

  if (options.options.additionalCertificateFile) {
    args.push(isWin ? "/ac" : "-ac", options.options.additionalCertificateFile)
  }

  if (isWin) {
    // must be last argument
    args.push(inputPath)
  }

  const toolInfo = await getToolPath()
  return await exec(toolInfo.path, args, {
    timeout: 120 * 1000,
    env: toolInfo.env || process.env
  })
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
