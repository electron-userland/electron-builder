import { Arch } from "builder-util"
import * as os from "os"
import * as path from "path"
import { ToolsetConfig } from "."
import { ToolInfo, computeToolEnv } from "../util/bundledTool"
import { downloadBuilderToolset } from "../util/electronGet"
import { isUseSystemSigncode } from "../util/flags"
import { getCustomToolsetPath } from "./custom"

export const wincodesignChecksums: Record<string, Record<string, string>> = {
  "1.0.0": {
    "rcedit-windows-2_0_0.zip": "589709935902545a8335190b08644cf61b46a9042e34c0c3ef0660a5aeddeaae",
    "win-codesign-darwin-arm64.zip": "7eb41c3e6e48a75ced6b3384de22185da4bb458960fa410970eedd4e838c5c14",
    "win-codesign-darwin-x86_64.zip": "3986c97429f002df63490193d7f787281836f055934e3cdd9e69c70a8acb695e",
    "win-codesign-linux-amd64.zip": "d362a1a981053841554867e3e9dff51fe420fd577b44653df89bd7d3c916b156",
    "win-codesign-linux-arm64.zip": "fb848d498281f081c937be48dd6ddaf49b0201f32210dfc816ad061c47ecd37b",
    "win-codesign-linux-i386.zip": "11f8d9ffbf5b01e3bf6321c6d93b9b5e43d0c2d2a9fde1bca07698f2eb967cdf",
    "win-codesign-windows-x64.zip": "1bd27f9fa553cb14bec8df530cb3caffcfb095f9dd187dab6eaf5e9b7d6e7bff",
    "windows-kits-bundle-10_0_26100_0.zip": "1a12c81024c3499c212fdc5fac34a918e6d199271a39dfc524f6d8da484329bd",
  },
  "1.1.0": {
    "rcedit-windows-2_0_0.zip": "c66591ebe0919c60231f0bf79ff223e6504bfa69bc13edc1fa8bfc6177b73402",
    "win-codesign-darwin-arm64.zip": "3f263b0e53cdc5410f6165471b2e808aee3148dc792efa23a7c303e7a01e67b7",
    "win-codesign-darwin-x86_64.zip": "143fbdfcbc53bc273fa181356be8416829778452621484d39eadbe1ce49979ba",
    "win-codesign-linux-amd64.zip": "65477fe8e40709b0f998928afb8336f82413b123310bf5adaa8efb7ed6ed0eeb",
    "win-codesign-linux-arm64.zip": "575b01a966f2b775bbea119de263957378e2bd28cbd064d35f9e981827e37b59",
    "win-codesign-linux-i386.zip": "aa3ce90e9aaa3449a228a3fa30633cdeb6b2791913786677a85c59db1d985598",
    "win-codesign-windows-x64.zip": "6e5dcc5d7af7c00a7387e2101d1ad986aef80e963a3526da07bd0e65de484c30",
    "windows-kits-bundle-10_0_26100_0.zip": "284f18a2fde66e6ecfbefc3065926c9bfdf641761a9e6cd2bd26e18d1e328bf7",
  },
} as const

function getLegacyWinCodeSignBin(): Promise<string> {
  return downloadBuilderToolset({
    releaseName: "winCodeSign-2.6.0",
    filenameWithExt: "winCodeSign-2.6.0.7z",
    checksums: { ["winCodeSign-2.6.0.7z"]: "cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4" },
  })
}

async function _getWindowsToolsBin(toolset: ToolsetConfig["winCodeSign"], file: string, resourcesDir: string): Promise<string> {
  if (toolset === "0.0.0" || toolset == null) {
    return getLegacyWinCodeSignBin()
  }
  if (typeof toolset === "object") {
    return getCustomToolsetPath(toolset, resourcesDir)
  }
  return downloadBuilderToolset({
    releaseName: `win-codesign@${toolset}`,
    filenameWithExt: file,
    checksums: wincodesignChecksums[toolset],
  })
}

export async function getSignToolPath(toolset: ToolsetConfig["winCodeSign"], isWin: boolean, resourcesDir: string): Promise<ToolInfo> {
  if (isUseSystemSigncode()) {
    return { path: "osslsigncode" }
  }

  // const signToolPath = await resolveEnvToolsetPath("SIGNTOOL_PATH", "file")
  // if (signToolPath != null) {
  //   return { path: signToolPath }
  // }

  if (isWin) {
    // windows kits are always the target arch; signtool can be used by either arch.
    const signtoolArch: Arch = process.arch === "x64" ? Arch.x64 : process.arch === "arm64" ? Arch.arm64 : Arch.ia32
    return { path: await getWindowsSignToolExe({ toolset, arch: signtoolArch, resourcesDir }) }
  } else {
    const vendor = await getOsslSigncodeBundle({ toolset, resourcesDir })
    return { path: vendor.path, env: vendor.env }
  }
}

export async function getWindowsKitsBundle({
  toolset,
  arch,
  resourcesDir,
}: {
  toolset: ToolsetConfig["winCodeSign"]
  arch: Arch
  resourcesDir: string
}): Promise<{ kit: string; appxAssets: string }> {
  // const kitPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_WINDOWS_KITS_PATH", "directory")
  // if (kitPath != null) {
  //   return { kit: kitPath, appxAssets: kitPath }
  // }
  if (toolset == null || toolset === "0.0.0") {
    const vendorPath = await getLegacyWinCodeSignBin()
    return { kit: path.resolve(vendorPath, "windows-10", arch === Arch.arm64 ? "x64" : Arch[arch]), appxAssets: vendorPath }
  }

  if (typeof toolset === "object") {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return { kit: path.resolve(vendorPath, arch === Arch.ia32 ? "x86" : Arch[arch]), appxAssets: vendorPath }
  }

  const file = "windows-kits-bundle-10_0_26100_0.zip"
  const vendorPath = await _getWindowsToolsBin(toolset, file, resourcesDir)
  return { kit: path.resolve(vendorPath, arch === Arch.ia32 ? "x86" : Arch[arch]), appxAssets: vendorPath }
}

export function isOldWin6() {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}

async function getWindowsSignToolExe({ toolset, arch, resourcesDir }: { toolset: ToolsetConfig["winCodeSign"]; arch: Arch; resourcesDir: string }) {
  if (toolset === "0.0.0" || toolset == null) {
    // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
    const vendorPath = await getLegacyWinCodeSignBin()
    if (isOldWin6()) {
      return path.resolve(vendorPath, "windows-6", "signtool.exe")
    } else {
      return path.resolve(vendorPath, "windows-10", process.arch === "ia32" ? "ia32" : "x64", "signtool.exe")
    }
  }

  if (typeof toolset === "object") {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return path.resolve(vendorPath, arch === Arch.ia32 ? "x86" : Arch[arch], "signtool.exe")
  }

  const vendorPath = await getWindowsKitsBundle({ toolset, arch, resourcesDir })
  return path.resolve(vendorPath.kit, "signtool.exe")
}

async function getOsslSigncodeBundle({ toolset, resourcesDir }: { toolset: ToolsetConfig["winCodeSign"]; resourcesDir: string }) {
  // const osslSigncodePath = await resolveEnvToolsetPath("ELECTRON_BUILDER_OSSL_SIGNCODE_PATH", "file")
  // if (osslSigncodePath != null) {
  //   return { path: osslSigncodePath }
  // }
  if (process.platform === "win32" || process.env.USE_SYSTEM_OSSLSIGNCODE === "true") {
    return { path: "osslsigncode" }
  }

  if (toolset === "0.0.0" || toolset == null) {
    const vendorBase = path.resolve(await getLegacyWinCodeSignBin(), process.platform)
    const vendorPath = process.platform === "darwin" ? path.resolve(vendorBase, "10.12") : vendorBase
    return { path: path.resolve(vendorPath, "osslsigncode"), env: process.platform === "darwin" ? computeToolEnv([path.resolve(vendorPath, "lib")]) : undefined }
  }

  if (typeof toolset === "object") {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return { path: path.resolve(vendorPath, "osslsigncode") }
  }

  const file = (() => {
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
  const vendorPath = await _getWindowsToolsBin(toolset, file, resourcesDir)
  return { path: path.resolve(vendorPath, "osslsigncode") }
}

export async function getRceditBundle({ toolset, resourcesDir }: { toolset: ToolsetConfig["winCodeSign"]; resourcesDir: string }) {
  const ia32 = "rcedit-ia32.exe"
  const x86 = "rcedit-x86.exe"
  const x64 = "rcedit-x64.exe"
  // const rcedit = await resolveEnvToolsetPath("ELECTRON_BUILDER_RCEDIT_PATH", "directory")
  // if (rcedit != null) {
  //   const overridePath = rcedit
  //   return { x86: path.resolve(overridePath, x86), x64: path.resolve(overridePath, x64) }
  // }
  if (toolset === "0.0.0" || toolset == null) {
    const vendorPath = await getLegacyWinCodeSignBin()
    return { x86: path.resolve(vendorPath, ia32), x64: path.resolve(vendorPath, x64) }
  }

  if (typeof toolset === "object") {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return { x86: path.resolve(vendorPath, x86), x64: path.resolve(vendorPath, x64) }
  }

  const file = "rcedit-windows-2_0_0.zip"
  const vendorPath = await _getWindowsToolsBin(toolset, file, resourcesDir)
  return { x86: path.resolve(vendorPath, x86), x64: path.resolve(vendorPath, x64) }
}
