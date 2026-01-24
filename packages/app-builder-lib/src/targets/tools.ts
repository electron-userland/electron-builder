import * as path from "path"
import { getBin, getBinFromUrl } from "../binDownload"
import { isEmptyOrSpaces, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as os from "os"
import { computeToolEnv } from "../util/bundledTool"

const wincodesignChecksums = {
  "rcedit-windows-2_0_0.zip": "NrBrX6M6qMG5vhUlMsD1P+byOfBq45KAD12Ono0lEfX8ynu3t0DmwJEMsRIjV/l0/SlptzM/eQXtY6+mOsvyjw==",
  "win-codesign-darwin-arm64.zip": "D2w1EXL+4yTZ4vLvc2R+fox1nCl3D+o4m8CPo8BcIXNXHy5evnIgRGycb1nXNwRvyzS7trmOdVabW4W+A8CY7w==",
  "win-codesign-darwin-x86_64.zip": "eF8TsYdSnPp2apYx/LoJMwwOvUAWo0ew0yqPxKfW6VflND2lmloJKxyfJzcBqhb1bvUNZAJtGuXU6KKOrUtPPQ==",
  "win-codesign-linux-amd64.zip": "bHk5IbCv90BELGQxN7YUiiwVjQ10tEmIgLWn30/+9ejCGW6Hx1ammuX+katIxSm0osCrSGkHKY+E9Lo2qZCx5A==",
  "win-codesign-linux-arm64.zip": "KLxwF6pvbyg37PI+IES17oOmrynaK3HR5fsFS7lUDzm7cNR8CUDirarwFP+G60Rl4cRC8hKbwNPumnPGStBXWQ==",
  "win-codesign-linux-i386.zip": "sgI+axxrzKGbrKey9cIHg+FfniQqD6+u80xN6OQfcPcGmA3+z1R1Q0W/Wxy+qJkylhIgcRgeHgjzWkdDDNucyA==",
  "win-codesign-windows-x64.zip": "XixPi+4XhoOdN5j90jx9rDgVAI0KHuM50D3dcWsn9NCxlZ5iTbDscvU7ARQG9h4+tWnprYZ2qbSoJiCvqlWZ4g==",
  "windows-kits-bundle-10_0_26100_0.zip": "vvvH4J0JG2FoUcpRzXxrQHyONCALUZjQigff5CawjDP1DuwwwdVcZdfE33IQoRl4TqMOSu56hOy7nN72hskqyg==",
}

// It's just easier to copy the map of checksums here rather then adding them to within each if-statement. Also, easy copy-paste from the releases page
const fpmChecksums = {
  "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "0n3BG/Xz1T5YIsoNNTG1bBege9E8A7rym5e3mfzHSHbiSiTS44v6GIHW4amDQk1Y5dtKtWXVq7FwjdmAf3kmMg==",
  "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "wPX3UheBznIlAXduM22W/d27i+DZVIB/MYnY5eh/qLeEEASZqHJWgN+pIckz3jT0dP37g1SQCikXXfsgxtMSPA==",
  "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "7miGWr6dfJSzXDD9ALqkwxvGACp7s7GR50NPcU0YwzbJL825H1SLwGJSGME+v57BxDI2xac47gFEkRZf5u9EtA==",
  "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "moRNjg6Q2iSXpkrm5sGNL2F6KilGNPagbefxhtr3VEqvAUSg2k2pMLr5xXUo0L4rZ4V+uETbwmbDCpeO3pmLyQ==",
  "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "UPzsXhkW2T7+oHSKgFsZsFUxxmPC9lNZHsQbT+OeoTbIGsb6+qf3m7c6uP0XvRFnJiu3MM3lE1xAWQOctvajWA==",
}

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  if (process.env.CUSTOM_FPM_PATH != null) {
    return path.resolve(process.env.CUSTOM_FPM_PATH)
  }
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
  }
  const getKey = () => {
    if (process.platform === "linux") {
      if (process.arch == "x64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z"
      } else if (process.arch === "arm64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z"
      }
      return "fpm-1.17.0-ruby-3.4.3-linux-i386.7z"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z"
    }
    return "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z"
  }

  const filename = getKey()
  const fpmPath = await getBinFromUrl("fpm@2.1.4", filename, fpmChecksums[filename])
  return path.join(fpmPath, exec)
}

export async function getWindowsKitsBundle({ useLegacy, arch }: { useLegacy: boolean | Nullish; arch: NodeJS.Architecture }) {
  const overridePath = process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return { kit: overridePath, appxAssets: overridePath }
  }

  const windowsKitArch = (x86: string) => (arch === "ia32" ? x86 : arch === "arm64" ? "arm64" : "x64")

  if (useLegacy === true) {
    const vendorPath = await getBin("winCodeSign")
    return { kit: path.join(vendorPath, "windows-10", windowsKitArch("ia32")), appxAssets: vendorPath }
  }
  const file = "windows-kits-bundle-10_0_26100_0.zip"
  const vendorPath = await getBinFromUrl("win-codesign@1.0.0", file, wincodesignChecksums[file])
  return { kit: path.join(vendorPath, windowsKitArch("x86")), appxAssets: vendorPath }
}

export function isOldWin6() {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}

export async function getLegacyWinSignTool({ useLegacy }: { useLegacy: boolean | Nullish }) {
  if (useLegacy === true) {
    // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
    const vendorPath = await getBin("winCodeSign")
    if (isOldWin6()) {
      return path.join(vendorPath, "windows-6", "signtool.exe")
    } else {
      return path.join(vendorPath, "windows-10", process.arch, "signtool.exe")
    }
  }
  const vendorPath = await getWindowsKitsBundle({ useLegacy, arch: process.arch  })
  return path.join(vendorPath.kit, "signtool.exe")
}

export async function getOsslSigncodeBundle({ useLegacy }: { useLegacy: boolean | Nullish }) {
  const overridePath = process.env.ELECTRON_BUILDER_OSSL_SIGNCODE_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return { path: overridePath }
  }
  if (process.platform === "win32" || process.env.USE_SYSTEM_OSSLSIGNCODE === "true") {
    return { path: "osslsigncode" }
  }

  if (useLegacy === true) {
    const vendorBase = path.join(await getBin("winCodeSign"), process.platform)
    const vendorPath = process.platform === "darwin" ? path.join(vendorBase, "10.12") : vendorBase
    return { path: path.join(vendorPath, "osslsigncode"), env: process.platform === "darwin" ? computeToolEnv([path.join(vendorPath, "lib")]) : undefined }
  }

  const filename = (() => {
    if (process.platform === "linux") {
      if (process.arch == "x64") {
        return "win-codesign-linux-amd64.zip"
      } else if (process.arch === "arm64") {
        return "win-codesign-linux-arm64.zip"
      }
      return "win-codesign-linux-i386.zip"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "win-codesign-darwin-arm64.zip"
    }
    return "win-codesign-darwin-x86_64.zip"
  })()
  const toolPath = await getBinFromUrl("win-codesign@1.0.0", filename, wincodesignChecksums[filename])
  return { path: path.join(toolPath, "osslsigncode") }
}

export async function getRceditBundle({ useLegacy }: { useLegacy: boolean | Nullish }) {
  const ia32 = "rcedit-ia32.exe"
  const x86 = "rcedit-x86.exe"
  const x64 = "rcedit-x64.exe"
  const overridePath = process.env.ELECTRON_BUILDER_RCEDIT_PATH?.trim()
  if (!isEmptyOrSpaces(overridePath)) {
    log.debug({ searchFiles: [x86, x64], overridePath }, `Using RCEdit from ELECTRON_BUILDER_RCEDIT_PATH`)
    return { x86: path.join(overridePath, x86), x64: path.join(overridePath, x64) }
  }
  if (useLegacy === true) {
    const vendorPath = await getBin("winCodeSign")
    return { x86: path.join(vendorPath, ia32), x64: path.join(vendorPath, x64) }
  }
  const file = "rcedit-windows-2_0_0.zip"
  const vendorPath = await getBinFromUrl("win-codesign@1.0.0", file, wincodesignChecksums[file])
  return { x86: path.join(vendorPath, x86), x64: path.join(vendorPath, x64) }
}
