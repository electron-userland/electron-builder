import { ToolsetConfig } from "app-builder-lib"
import { download, downloadBuilderToolset, getCustomToolsetPath, resolveToolsetVersion } from "app-builder-lib/internal"
import { stat } from "fs/promises"
import * as path from "path"

// Newest squirrel.windows bundle — selected when `toolsets.squirrel` is unset / null / "latest".
const SQUIRREL_LATEST = "1.1.0"

export const squirrelWindowsChecksums = {
  "1.1.0": {
    "squirrel.windows-2.0.1-patched.zip": "86e6c3e9ebf10e29cfde99dfff98f3738c29c9562495c540270129ffde1f79cf",
  },
} as const

/**
 * Returns the path to the squirrel.windows toolset directory. It contains an
 * `electron-winstaller/vendor/` subtree with the Squirrel vendor executables (Squirrel.exe,
 * nuget.exe, SyncReleases.exe, 7z, …).
 *
 * Honors `toolsets.squirrel`: a pinned version (or unset / `"latest"`) downloads the maintained
 * electron-builder-binaries bundle; a {@link ToolsetCustom} object supplies a custom or local bundle
 * (which must mirror the same `electron-winstaller/vendor/` layout).
 */
export async function getSquirrelToolsetPath(toolset: ToolsetConfig["squirrel"], resourcesDir: string): Promise<string> {
  if (typeof toolset === "object" && toolset != null) {
    return getCustomToolsetPath(toolset, resourcesDir)
  }
  const version = resolveToolsetVersion(toolset, SQUIRREL_LATEST)
  return downloadBuilderToolset({
    releaseName: `squirrel.windows@${version}`,
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: squirrelWindowsChecksums[version],
  })
}

// TEMPORARY: nuget.exe override. The published squirrel.windows@1.1.0 bundle ships the Chocolatey
// shim for nuget.exe, which resolves the real binary relative to its own install path and fails once
// relocated to a temp vendor directory. Until squirrel.windows bundles the standalone portable exe
// (electron-builder-binaries#203), download a pinned NuGet.CommandLine build at runtime and overwrite
// the bundled shim. The same win-x86 exe runs natively on Windows and under mono on Linux/macOS.
//
// TODO(remove after squirrel.windows@1.1.1): once electron-builder-binaries#203 ships the pinned
// nuget.exe in the bundle, delete prepareNugetExe + isUsableNuget + the NUGET_* constants and bump
// SQUIRREL_LATEST to that release. (isUsableNuget already makes this a no-op against such a bundle,
// so the runtime download stops on its own once the version is bumped.)
const NUGET_VERSION = "6.14.0"
const NUGET_SHA256 = "92dbed160ddee0f64b901e907439e021211b428e57c089ecc12fc38dcc4bd9a5"
const NUGET_URL = `https://dist.nuget.org/win-x86-commandline/v${NUGET_VERSION}/nuget.exe`
// A Chocolatey shim is ~0.4 MB; a real nuget.exe is several MB. Anything above this is already usable.
const MIN_USABLE_NUGET_BYTES = 2_000_000

async function isUsableNuget(file: string): Promise<boolean> {
  try {
    return (await stat(file)).size >= MIN_USABLE_NUGET_BYTES
  } catch {
    return false
  }
}

/**
 * Ensures `vendorDirectory` holds a usable standalone nuget.exe. If the bundle already ships a real
 * one (a future squirrel.windows release, or a custom `toolsets.squirrel` bundle), it is kept as-is;
 * otherwise a pinned NuGet.CommandLine build is downloaded and cached, replacing the broken shim.
 */
export async function prepareNugetExe(vendorDirectory: string): Promise<void> {
  const target = path.join(vendorDirectory, "nuget.exe")
  if (await isUsableNuget(target)) {
    return
  }
  await download(NUGET_URL, target, NUGET_SHA256)
}
