import { exec } from "./util/util"
import { rename } from "fs-extra-p"
import * as path from "path"
import { release } from "os"
import { getBinFromBintray } from "./util/binDownload"

const TOOLS_VERSION = "1.5.0"

export function getSignVendorPath() {
  return getBinFromBintray("winCodeSign", TOOLS_VERSION, "5febefb4494f0f62f0f5c0cd6408f0930caf5943ccfeea2bbf90d2eeb34c571d")
}

export interface SignOptions {
  readonly path: string

  readonly cert?: string | null
  readonly subjectName?: string | null

  readonly name?: string | null
  readonly password?: string | null
  readonly site?: string | null
  readonly hash?: Array<string> | null

  readonly tr?: string | null
}

export async function sign(options: SignOptions) {
  let hashes = options.hash
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
  for (let hash of hashes) {
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
    const timestampingServiceUrl = "http://timestamp.verisign.com/scripts/timstamp.dll"
    if (isWin) {
      args.push(nest || hash === "sha256" ? "/tr" : "/t", nest || hash === "sha256" ? (options.tr || "http://timestamp.comodoca.com/rfc3161") : timestampingServiceUrl)
    }
    else {
      args.push("-t", timestampingServiceUrl)
    }
  }

  const certificateFile = options.cert
  if (certificateFile == null) {
    if (process.platform !== "win32") {
      throw new Error("certificateSubjectName supported only on Windows")
    }
    args.push("/n", options.subjectName!)
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

  if (isWin) {
    // must be last argument
    args.push(inputPath)
  }

  return await exec(await getToolPath(), args)
}

// async function verify(options: any) {
//   const out = await exec(await getToolPath(options), [
//     "verify",
//     "-in", options.path,
//     "-require-leaf-hash", options.hash
//   ])
//   if (out.includes("No signature found.")) {
//     throw new Error("No signature found")
//   }
//   else if (out.includes("Leaf hash match: failed")) {
//     throw new Error("Leaf hash match failed")
//   }
// }

function getOutputPath(inputPath: string, hash: string) {
  const extension = path.extname(inputPath)
  return path.join(path.dirname(inputPath), `${path.basename(inputPath, extension)}-signed-${hash}${extension}`)
}

async function getToolPath(): Promise<string> {
  if (process.env.USE_SYSTEM_SIGNCODE) {
    return "osslsigncode"
  }

  let result = process.env.SIGNTOOL_PATH
  if (result) {
    return result
  }

  const vendorPath = await getSignVendorPath()
  if (process.platform === "win32") {
    if (release().startsWith("6.")) {
      return path.join(vendorPath, "windows-6", "signtool.exe")
    }
    else {
      return path.join(vendorPath, "windows-10", process.arch, "signtool.exe")
    }
  }
  else if (process.platform === "darwin" && process.env.CI) {
    return path.join(vendorPath, process.platform, "ci", "osslsigncode")
  }
  else {
    return path.join(vendorPath, process.platform, "osslsigncode")
  }
}
