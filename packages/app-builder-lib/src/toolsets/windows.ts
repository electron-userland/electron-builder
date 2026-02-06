import { isEmptyOrSpaces, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as os from "os"
import * as path from "path"
import { getBin, getBinFromUrl } from "../binDownload"
import { ToolsetConfig } from "../configuration"
import { ToolInfo, computeToolEnv } from "../util/bundledTool"
import { isUseSystemSigncode } from "../util/flags"

export const wincodesignChecksums = {
  "0.0.0": {
    // legacy
  },
  "1.0.0": {
    "rcedit-windows-2_0_0.zip": "NrBrX6M6qMG5vhUlMsD1P+byOfBq45KAD12Ono0lEfX8ynu3t0DmwJEMsRIjV/l0/SlptzM/eQXtY6+mOsvyjw==",
    "win-codesign-darwin-arm64.zip": "D2w1EXL+4yTZ4vLvc2R+fox1nCl3D+o4m8CPo8BcIXNXHy5evnIgRGycb1nXNwRvyzS7trmOdVabW4W+A8CY7w==",
    "win-codesign-darwin-x86_64.zip": "eF8TsYdSnPp2apYx/LoJMwwOvUAWo0ew0yqPxKfW6VflND2lmloJKxyfJzcBqhb1bvUNZAJtGuXU6KKOrUtPPQ==",
    "win-codesign-linux-amd64.zip": "bHk5IbCv90BELGQxN7YUiiwVjQ10tEmIgLWn30/+9ejCGW6Hx1ammuX+katIxSm0osCrSGkHKY+E9Lo2qZCx5A==",
    "win-codesign-linux-arm64.zip": "KLxwF6pvbyg37PI+IES17oOmrynaK3HR5fsFS7lUDzm7cNR8CUDirarwFP+G60Rl4cRC8hKbwNPumnPGStBXWQ==",
    "win-codesign-linux-i386.zip": "sgI+axxrzKGbrKey9cIHg+FfniQqD6+u80xN6OQfcPcGmA3+z1R1Q0W/Wxy+qJkylhIgcRgeHgjzWkdDDNucyA==",
    "win-codesign-windows-x64.zip": "XixPi+4XhoOdN5j90jx9rDgVAI0KHuM50D3dcWsn9NCxlZ5iTbDscvU7ARQG9h4+tWnprYZ2qbSoJiCvqlWZ4g==",
    "windows-kits-bundle-10_0_26100_0.zip": "vvvH4J0JG2FoUcpRzXxrQHyONCALUZjQigff5CawjDP1DuwwwdVcZdfE33IQoRl4TqMOSu56hOy7nN72hskqyg==",
  },
  "1.1.0": {
    "rcedit-windows-2_0_0.zip": "sGDrjBJTVuhvcwbGAHv3/RVd9SA0HKBIDrtLk7NaAW1gSsmY0QZGn9fuhs/cjYHxZf39+PY2dOzqgLilhyeftA==",
    "win-codesign-darwin-arm64.zip": "d0M76FslJ8+WxTJmHZjaGxYA/9yLS++zETrrZ57qf+ia/MUy9sRRohpPhZ62VgpUusUdNqqL6y3Zu1Oux/CBbQ==",
    "win-codesign-darwin-x86_64.zip": "JgPwyRgt9MREDyjrUlccaeEVwfcXyBokSoiEvtJOipcPIAdOh6ECwj7ScjyzClWmh1WSnTEWKw6cFKwMXwxPTw==",
    "win-codesign-linux-amd64.zip": "xqlwK9INio4Twp2sMH98uUKG+BuOLG8GJTeypD+Ay26TpV+/TIanOMvWMi2UB6dFW/B/XMVC2JDr+rlWikVJ0A==",
    "win-codesign-linux-arm64.zip": "DQES7Koe6bOBbjuJWSRTFu41YfNeja5PLgL24ArklM1iSXZSb6AawgS0cSlwgIxmKfa08/xQ6emxfumg8sSA5A==",
    "win-codesign-linux-i386.zip": "B+zhnU+5hJwmyXFs2ZK3lvIziqmz8dHStgZmSVgSXbKPx1SjZCm7JXk1FgLxk9O/mob5Hk/rJfrsO0WMjwgSAQ==",
    "win-codesign-windows-x64.zip": "lLEOXdJP3dzjRI+/E3Rf8e3RqEh1qs0DRMRgmxHDbuSmXABAwEzhW+tj8g/VMIlxPTD12cyvWIyMbRZq4RxvsA==",
    "windows-kits-bundle-10_0_26100_0.zip": "09Fh+zSwEiJMA6R2cW6tvpAlUDAq3h7kFzXt4scos62fygTMAK/G+JoRV4FMwBLcNiwUcn+A5ju2sJLHEfVdKA==",
  },
} as const

type CodeSignVersionKey = keyof typeof wincodesignChecksums

function _getWindowsToolsBin<V extends CodeSignVersionKey>(winCodeSign: V, file: keyof (typeof wincodesignChecksums)[V]): Promise<string> {
  return getBinFromUrl(`win-codesign@${winCodeSign}`, file as string, wincodesignChecksums[winCodeSign][file] as string)
}

export async function getSignToolPath(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish, isWin = process.platform === "win32"): Promise<ToolInfo> {
  if (isUseSystemSigncode()) {
    return { path: "osslsigncode" }
  }

  const result = process.env.SIGNTOOL_PATH?.trim()
  if (result) {
    return { path: path.resolve(result) }
  }

  if (isWin) {
    return { path: await getWindowsSignToolExe(winCodeSign) }
  } else {
    const vendor = await getOsslSigncodeBundle(winCodeSign)
    return { path: vendor.path, env: vendor.env }
  }
}

export async function getWindowsKitsBundle({ winCodeSign, arch }: { winCodeSign: CodeSignVersionKey | Nullish; arch: NodeJS.Architecture }) {
  const overridePath = process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return { kit: overridePath, appxAssets: overridePath }
  }

  const windowsKitArch = (x86: string) => (arch === "ia32" ? x86 : arch === "arm64" ? "arm64" : "x64")

  const useLegacy = winCodeSign == null || winCodeSign === "0.0.0"
  if (useLegacy) {
    const vendorPath = await getBin("winCodeSign")
    return { kit: path.resolve(vendorPath, "windows-10", windowsKitArch("ia32")), appxAssets: vendorPath }
  }
  const file = "windows-kits-bundle-10_0_26100_0.zip"
  const vendorPath = await _getWindowsToolsBin(winCodeSign, file)
  return { kit: path.resolve(vendorPath, windowsKitArch("x86")), appxAssets: vendorPath }
}

export function isOldWin6() {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}

async function getWindowsSignToolExe(winCodeSign: ToolsetConfig["winCodeSign"] | Nullish) {
  if (winCodeSign === "0.0.0" || winCodeSign == null) {
    // use modern signtool on Windows Server 2012 R2 to be able to sign AppX
    const vendorPath = await getBin("winCodeSign")
    if (isOldWin6()) {
      return path.resolve(vendorPath, "windows-6", "signtool.exe")
    } else {
      return path.resolve(vendorPath, "windows-10", process.arch === "ia32" ? "ia32" : "x64", "signtool.exe")
    }
  }
  const vendorPath = await getWindowsKitsBundle({ winCodeSign, arch: process.arch })
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
    const vendorBase = path.resolve(await getBin("winCodeSign"), process.platform)
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
    const vendorPath = await getBin("winCodeSign")
    return { x86: path.join(vendorPath, ia32), x64: path.join(vendorPath, x64) }
  }
  const file = "rcedit-windows-2_0_0.zip"
  const vendorPath = await _getWindowsToolsBin(winCodeSign, file)
  return { x86: path.join(vendorPath, x86), x64: path.join(vendorPath, x64) }
}
