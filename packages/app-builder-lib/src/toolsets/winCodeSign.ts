import { InvalidConfigurationError, sanitizeDirPath } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as os from "os"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { ToolInfo, computeToolEnv } from "../util/bundledTool.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest win-codesign bundle — selected when the config is unset / null / "latest".
export const WIN_CODESIGN_LATEST = "1.3.0"

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
  "1.1.1": {
    "rcedit-windows-2_0_0.zip": "a4133c265a53a8a6d5063c6d92603dc2dcd47546e50bfd79c93bc56692d6fcb3",
    "win-codesign-darwin-arm64.zip": "8c655fe77edb326fb6b7051a6f74b0f09843f7d3de7887c1d217088cff47ece6",
    "win-codesign-darwin-x86_64.zip": "b5882783c910e10b18792ea8c319fa8d6ce9dbbdd0d6a283a504787b3e9e96c6",
    "win-codesign-linux-amd64.zip": "8e0c05c33b3fb24d41ac41d37b0c70ad9f8c1c82bb667ed60c2a6a8d141b7c62",
    "win-codesign-linux-arm64.zip": "535f318b8aac1c9487e0f8b58df0a4182103e303ccaca1c9d0ef20b1020e03ca",
    "win-codesign-linux-i386.zip": "e432f2819f557f9d1175e26f374eec8a368eb23b519c12c690a969ce369966c5",
    "win-codesign-windows-x64.zip": "47d78ed7e229e891866b0d0e10dde6df9617c32a89fc76a9e280ffabfc80e1fe",
    "windows-kits-bundle-10_0_26100_0.zip": "f7e67213ce690386b2f0a58e3af986dbf223bc1b45ef4a75e77ff85f66b78c94",
  },
  "1.2.1": {
    "rcedit-windows-2_0_0.zip": "1c2b68b9ae41229566c008ce98c4f6cd2b642ace85284e753d1d3509377f9e67",
    "win-codesign-darwin-arm64.zip": "ac7c1d9279490fc88e9e744ed965ad7e1d377e0219142dab0ab49cfba3ede764",
    "win-codesign-darwin-x86_64.zip": "7c4188bb301621cde22f918bb2d1a86ef9892ad401a40b7838b80efc9165547d",
    "win-codesign-linux-amd64.zip": "69b94f71f9189ded6b962718df102e0ffe0a81d506351fecd3df3d73c7166e31",
    "win-codesign-linux-arm64.zip": "c959031605a5ab994bfd9b84d37bc5bcaba8f39d54a6d69bd2541b2a91ecf723",
    "win-codesign-linux-i386.zip": "fc937f40655b9839b67ed35cc7b571795b3f7b7b15db10c3026599db43f1c2b1",
    "win-codesign-windows-arm64.zip": "96390eb3130e63ea9d3641ef076c941c6f51463125498cf53b2503e52c38082d",
    "win-codesign-windows-x64.zip": "40b1d88ea074de58ddc7595a2b6d30ca23f81bcce33f110102304337538fcbeb",
    "windows-kits-bundle-10_0_26100_0.zip": "9b198db76ae75b124169aef3369fb96c17b39dbf16f16f1264dbd9fd001d976f",
  },
  "1.3.0": {
    "ats-bundle-1_0_95.zip": "93e1441cd8c60f7b7a57a3e0e20a2109994e33a7f42bd04c998204a1928f9f2f", // new
    "dotnet-runtime-win-x64-8_0_28.zip": "71b9aa960ebaae196a62ec0bb1a4d224e1b48e18b6dc5eed89a37b28b72965ee", // new
    "rcedit-windows-2_0_0.zip": "84ea279c5d94977fecffbe0f21b073318575dc631a3dae46fadb14309f2eef11",
    "win-codesign-darwin-arm64.zip": "c5c1e1e106a5feff27d320c57856e362d8f605c09c7c02fc42d9309b72c56372",
    "win-codesign-darwin-x86_64.zip": "4fd5af2c4c655257685fad1769457419e086ec0862ee36f893b3659e1788c8ca",
    "win-codesign-linux-amd64.zip": "58c708762b3088a2c6c98494c4813e2a1d030a314a7958c77a2806d58e5efe95",
    "win-codesign-linux-arm64.zip": "1e9dd1ae149a4e0c988b5529fb983d7a8265cd71e7f3fb5af4cce501005a670c",
    "win-codesign-linux-i386.zip": "b5c3249fb565bb956a48aaff01bc1bbbd9acaf3c981960f2b754210f9df95cd9",
    "win-codesign-windows-arm64.zip": "c707709440a07e400b4053d9bab77c9f335505c1701035c2aa8285d880360989",
    "win-codesign-windows-x64.zip": "40d621aad7593e6298ce1d24798760dcefb053f358be891d74c95386ac2ac50b",
    "windows-kits-bundle-10_0_26100_0.zip": "2eeb955e580103e1bbecf9666dca87b141c3bb73ad99ead64bb8821755694ecd",
  },
} as const

type CodeSignVersionKey = keyof typeof wincodesignChecksums

function _getWindowsToolsBin<V extends CodeSignVersionKey>(winCodeSign: V, file: keyof (typeof wincodesignChecksums)[V]): Promise<string> {
  const filenameWithExt = file as string
  return downloadBuilderToolset({
    releaseName: `win-codesign@${winCodeSign}`,
    filenameWithExt,
    checksums: { [filenameWithExt]: wincodesignChecksums[winCodeSign][file] as string },
  })
}

export async function getSignToolPath(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish, isWin: boolean, resourcesDir: string): Promise<ToolInfo> {
  if (isWin) {
    return { path: await getWindowsSignToolExe({ winCodeSign, resourcesDir }) }
  } else {
    const vendor = await getOsslSigncodeBundle(winCodeSign, resourcesDir)
    return { path: vendor.path, env: vendor.env }
  }
}

/**
 * Resolve the Windows Kits bundle paths.
 *
 * The `kit` subdirectory holds HOST executables (`signtool.exe` / `makeappx.exe` / `makepri.exe`), so
 * it is always the x64 kit (x86 on 32-bit hosts) — never arm64. x64 binaries run on x64 hosts natively
 * and on arm64 Windows via emulation, whereas an arm64 binary cannot run on an x64 host and fails with
 * `spawn UNKNOWN`. The artifact's target arch is irrelevant here.
 * `appxAssets` is arch-independent (the bundle root).
 */
export async function getWindowsKitsBundle({ winCodeSign, resourcesDir }: { winCodeSign: ToolsetConfig["winCodeSign"] | Nullish; resourcesDir?: string }) {
  const kitArch = process.arch === "ia32" ? "x86" : "x64"
  if (typeof winCodeSign === "object" && winCodeSign != null) {
    const vendorPath = sanitizeDirPath(await getCustomToolsetPath(winCodeSign, resourcesDir), resourcesDir || undefined)
    return { kit: path.join(vendorPath, kitArch), appxAssets: vendorPath }
  }

  const version = resolveToolsetVersion(winCodeSign, WIN_CODESIGN_LATEST)
  if (version === "0.0.0") {
    const vendorPath = sanitizeDirPath(await getLegacyWinCodeSignBin())
    return { kit: path.join(vendorPath, "windows-10", kitArch), appxAssets: vendorPath }
  }
  const file = "windows-kits-bundle-10_0_26100_0.zip"
  const vendorPath = sanitizeDirPath(await _getWindowsToolsBin(version, file))
  return { kit: path.join(vendorPath, kitArch), appxAssets: vendorPath }
}

export function isOldWin6() {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}

async function getWindowsSignToolExe({ winCodeSign, resourcesDir = "" }: { winCodeSign: ToolsetConfig["winCodeSign"] | Nullish; resourcesDir?: string }) {
  if (typeof winCodeSign !== "object" && resolveToolsetVersion(winCodeSign, WIN_CODESIGN_LATEST) === "0.0.0") {
    // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
    const vendorPath = sanitizeDirPath(await getLegacyWinCodeSignBin())
    if (isOldWin6()) {
      return path.join(vendorPath, "windows-6", "signtool.exe")
    } else {
      return path.join(vendorPath, "windows-10", process.arch === "ia32" ? "ia32" : "x64", "signtool.exe")
    }
  }
  // kit is already sanitized by getWindowsKitsBundle
  const { kit } = await getWindowsKitsBundle({ winCodeSign, resourcesDir })
  return path.join(kit, "signtool.exe")
}

async function getOsslSigncodeBundle(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish, resourcesDir = "") {
  // A custom toolset is an explicit user override — honored on every platform, before any platform default/fallback.
  if (typeof winCodeSign === "object" && winCodeSign != null) {
    const vendorPath = sanitizeDirPath(await getCustomToolsetPath(winCodeSign, resourcesDir), resourcesDir || undefined)
    return { path: path.join(vendorPath, "osslsigncode") }
  }

  if (process.platform === "win32") {
    // Unreachable in normal flow: osslsigncode is only requested when the host is not Windows (Windows signs via
    // signtool). Kept as defense-in-depth — fail loudly instead of resolving a bare `osslsigncode` from $PATH.
    throw new InvalidConfigurationError(
      `osslsigncode is not used on Windows (signing uses signtool). To override, configure a custom toolset: toolsets: { winCodeSign: { url: "file:///absolute/path/to/dir" } }`
    )
  }

  const version = resolveToolsetVersion(winCodeSign, WIN_CODESIGN_LATEST)
  if (version === "0.0.0") {
    const legacyBase = sanitizeDirPath(await getLegacyWinCodeSignBin())
    const vendorBase = path.join(legacyBase, process.platform)
    const vendorPath = process.platform === "darwin" ? path.join(vendorBase, "10.12") : vendorBase
    return { path: path.join(vendorPath, "osslsigncode"), env: process.platform === "darwin" ? computeToolEnv([path.join(vendorPath, "lib")]) : undefined }
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
  const vendorPath = sanitizeDirPath(await _getWindowsToolsBin(version, file))
  return { path: path.join(vendorPath, "osslsigncode") }
}

export async function getAtsBundleDir(winCodeSign: string): Promise<string> {
  const version = winCodeSign === "latest" ? WIN_CODESIGN_LATEST : winCodeSign
  const checksum = (wincodesignChecksums as Record<string, Record<string, string>>)[version]?.["ats-bundle-1_0_95.zip"]
  if (!checksum) {
    throw new Error(`winCodeSign version "${version}" does not include an ATS bundle (requires >= 1.3.0)`)
  }
  return downloadBuilderToolset({
    releaseName: `win-codesign@${version}`,
    filenameWithExt: "ats-bundle-1_0_95.zip",
    checksums: { "ats-bundle-1_0_95.zip": checksum },
  })
}

export async function getDotnetRuntimeDir(winCodeSign: string): Promise<string> {
  const version = winCodeSign === "latest" ? WIN_CODESIGN_LATEST : winCodeSign
  const checksum = (wincodesignChecksums as Record<string, Record<string, string>>)[version]?.["dotnet-runtime-win-x64-8_0_28.zip"]
  if (!checksum) {
    throw new Error(`winCodeSign version "${version}" does not include a .NET runtime bundle (requires >= 1.3.0)`)
  }
  return downloadBuilderToolset({
    releaseName: `win-codesign@${version}`,
    filenameWithExt: "dotnet-runtime-win-x64-8_0_28.zip",
    checksums: { "dotnet-runtime-win-x64-8_0_28.zip": checksum },
  })
}

export async function getRceditBundle(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish, resourcesDir = "") {
  const ia32 = "rcedit-ia32.exe"
  const x86 = "rcedit-x86.exe"
  const x64 = "rcedit-x64.exe"
  if (typeof winCodeSign === "object" && winCodeSign != null) {
    const vendorPath = sanitizeDirPath(await getCustomToolsetPath(winCodeSign, resourcesDir), resourcesDir || undefined)
    return { x86: path.join(vendorPath, x86), x64: path.join(vendorPath, x64) }
  }
  const version = resolveToolsetVersion(winCodeSign, WIN_CODESIGN_LATEST)
  if (version === "0.0.0") {
    const vendorPath = sanitizeDirPath(await getLegacyWinCodeSignBin())
    return { x86: path.join(vendorPath, ia32), x64: path.join(vendorPath, x64) }
  }
  const file = "rcedit-windows-2_0_0.zip"
  const vendorPath = sanitizeDirPath(await _getWindowsToolsBin(version, file))
  return { x86: path.join(vendorPath, x86), x64: path.join(vendorPath, x64) }
}
