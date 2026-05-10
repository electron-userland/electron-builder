import { Arch, isEmptyOrSpaces, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as os from "os"
import * as path from "path"
import { getBinFromUrl } from "../binDownload"
import { ToolsetConfig } from "../configuration"
import { ToolInfo, computeToolEnv } from "../util/bundledTool"
import { downloadBuilderToolset } from "../util/electronGet"
import { isUseSystemSigncode } from "../util/flags"

function getLegacyWinCodeSignBin(): Promise<string> {
  return downloadBuilderToolset({
    releaseName: "winCodeSign-2.6.0",
    filenameWithExt: "winCodeSign-2.6.0.7z",
    checksums: { ["winCodeSign-2.6.0.7z"]: "cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4" },
  })
}

export const wincodesignChecksums = {
  "0.0.0": {
    // legacy — downloads winCodeSign-2.6.0 via getLegacyWinCodeSignBin()
  },
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

type CodeSignVersionKey = keyof typeof wincodesignChecksums

function _getWindowsToolsBin<V extends CodeSignVersionKey>(winCodeSign: V, file: keyof (typeof wincodesignChecksums)[V]): Promise<string> {
  return getBinFromUrl(`win-codesign@${winCodeSign}`, file as string, wincodesignChecksums[winCodeSign][file] as string)
}

export async function getSignToolPath(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish, isWin: boolean): Promise<ToolInfo> {
  if (isUseSystemSigncode()) {
    return { path: "osslsigncode" }
  }

  const result = process.env.SIGNTOOL_PATH?.trim()
  if (result) {
    return { path: path.resolve(result) }
  }

  if (isWin) {
    // windows kits are always the target arch; signtool can be used by either arch.
    const signtoolArch: Arch = process.arch === "x64" ? Arch.x64 : process.arch === "arm64" ? Arch.arm64 : Arch.ia32
    return { path: await getWindowsSignToolExe({ winCodeSign, arch: signtoolArch }) }
  } else {
    const vendor = await getOsslSigncodeBundle(winCodeSign)
    return { path: vendor.path, env: vendor.env }
  }
}

export async function getWindowsKitsBundle({ winCodeSign, arch }: { winCodeSign: CodeSignVersionKey | Nullish; arch: Arch }) {
  const overridePath = process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return { kit: overridePath, appxAssets: overridePath }
  }

  const useLegacy = winCodeSign == null || winCodeSign === "0.0.0"
  if (useLegacy) {
    const vendorPath = await getLegacyWinCodeSignBin()
    return { kit: path.resolve(vendorPath, "windows-10", arch === Arch.arm64 ? "x64" : Arch[arch]), appxAssets: vendorPath }
  }
  const file = "windows-kits-bundle-10_0_26100_0.zip"
  const vendorPath = await _getWindowsToolsBin(winCodeSign, file)
  return { kit: path.resolve(vendorPath, arch === Arch.ia32 ? "x86" : Arch[arch]), appxAssets: vendorPath }
}

export function isOldWin6() {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}

async function getWindowsSignToolExe({ winCodeSign, arch }: { winCodeSign: CodeSignVersionKey | Nullish; arch: Arch }) {
  if (winCodeSign === "0.0.0" || winCodeSign == null) {
    // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
    const vendorPath = await getLegacyWinCodeSignBin()
    if (isOldWin6()) {
      return path.resolve(vendorPath, "windows-6", "signtool.exe")
    } else {
      return path.resolve(vendorPath, "windows-10", process.arch === "ia32" ? "ia32" : "x64", "signtool.exe")
    }
  }
  const vendorPath = await getWindowsKitsBundle({ winCodeSign, arch })
  return path.resolve(vendorPath.kit, "signtool.exe")
}

async function getOsslSigncodeBundle(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish) {
  const overridePath = process.env.ELECTRON_BUILDER_OSSL_SIGNCODE_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return { path: overridePath }
  }
  if (process.platform === "win32" || process.env.USE_SYSTEM_OSSLSIGNCODE === "true") {
    return { path: "osslsigncode" }
  }

  if (winCodeSign === "0.0.0" || winCodeSign == null) {
    const vendorBase = path.resolve(await getLegacyWinCodeSignBin(), process.platform)
    const vendorPath = process.platform === "darwin" ? path.resolve(vendorBase, "10.12") : vendorBase
    return { path: path.resolve(vendorPath, "osslsigncode"), env: process.platform === "darwin" ? computeToolEnv([path.resolve(vendorPath, "lib")]) : undefined }
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
  const vendorPath = await _getWindowsToolsBin(winCodeSign, file)
  return { path: path.resolve(vendorPath, "osslsigncode") }
}

export async function getRceditBundle(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish) {
  const ia32 = "rcedit-ia32.exe"
  const x86 = "rcedit-x86.exe"
  const x64 = "rcedit-x64.exe"
  const overridePath = process.env.ELECTRON_BUILDER_RCEDIT_PATH?.trim()
  if (!isEmptyOrSpaces(overridePath)) {
    log.debug({ searchFiles: [x86, x64], overridePath }, `Using RCEdit from ELECTRON_BUILDER_RCEDIT_PATH`)
    return { x86: path.join(overridePath, x86), x64: path.join(overridePath, x64) }
  }
  if (winCodeSign === "0.0.0" || winCodeSign == null) {
    const vendorPath = await getLegacyWinCodeSignBin()
    return { x86: path.join(vendorPath, ia32), x64: path.join(vendorPath, x64) }
  }
  const file = "rcedit-windows-2_0_0.zip"
  const vendorPath = await _getWindowsToolsBin(winCodeSign, file)
  return { x86: path.join(vendorPath, x86), x64: path.join(vendorPath, x64) }
}
