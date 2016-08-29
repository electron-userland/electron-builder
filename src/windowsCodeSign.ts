import { exec } from "./util/util"
import { rename } from "fs-extra-p"
import * as path from "path"
import { release } from "os"
import { getBinFromBintray } from "./util/binDownload"
//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

const TOOLS_VERSION = "1.4.2"

export function getSignVendorPath() {
  return getBinFromBintray("winCodeSign", TOOLS_VERSION, "ca94097071ce6433a2e18a14518b905ac162afaef82ed88713a8a91c32a55b21")
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
  if (path.extname(options.path) === ".msi") {
    hashes = [hashes != null && !hashes.includes("sha1") ? "sha256" : "sha1"]
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
  const timestampingServiceUrl = "http://timestamp.verisign.com/scripts/timstamp.dll"
  const isWin = process.platform === "win32"
  const args = isWin ? [
    "sign",
    nest || hash === "sha256" ? "/tr" : "/t", nest || hash === "sha256" ? (options.tr || "http://timestamp.comodoca.com/rfc3161") : timestampingServiceUrl
  ] : [
    "-in", inputPath,
    "-out", outputPath,
    "-t", timestampingServiceUrl
  ]

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
  }

  if (!isWin || hash !== "sha1") {
    args.push(isWin ? "/fd" : "-h", hash)
    if (isWin) {
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

async function getToolPath() {
  if (process.env.USE_SYSTEM_SIGNCODE) {
    return "osslsigncode"
  }

  let result = process.env.SIGNTOOL_PATH
  if (result) {
    return result
  }

  const vendorPath = await getSignVendorPath()
  if (process.platform === "win32") {
    return path.join(vendorPath, `windows-${(release().startsWith("6.") ? "6" : "10")}`, "signtool.exe")
  }
  else if (process.platform === "darwin" && process.env.CI) {
    return path.join(vendorPath, process.platform, "ci", "osslsigncode")
  }
  else {
    return path.join(vendorPath, process.platform, "osslsigncode")
  }
}
