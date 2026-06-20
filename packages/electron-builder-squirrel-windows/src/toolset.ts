import { download, downloadBuilderToolset } from "app-builder-lib/internal"
import { exists, log, resolveEnvShellValue } from "builder-util"
import { stat } from "fs/promises"
import * as path from "path"

const ENV_KEY = "ELECTRON_BUILDER_SQUIRREL_TOOLSET_DIR"

export const squirrelWindowsChecksums = {
  "1.1.0": {
    "squirrel.windows-2.0.1-patched.zip": "86e6c3e9ebf10e29cfde99dfff98f3738c29c9562495c540270129ffde1f79cf",
  },
} as const

/**
 * Validates and resolves the {@link ENV_KEY} override. Returns the absolute directory path when the
 * env var is set, or `null` when it is absent. Throws an actionable error when the value is set but
 * invalid (relative path, missing, or not a directory) rather than silently falling back to download.
 */
async function resolveToolsetEnvDir(): Promise<string | null> {
  const value = resolveEnvShellValue(ENV_KEY)
  if (value == null) {
    return null
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${ENV_KEY} must be an absolute path: ${value}`)
  }
  const dir = path.resolve(value)
  if (!(await exists(dir))) {
    throw new Error(`${ENV_KEY} path does not exist: ${dir}`)
  }
  if (!(await stat(dir)).isDirectory()) {
    throw new Error(`${ENV_KEY} path must be a directory: ${dir}`)
  }
  log.info({ [ENV_KEY]: dir }, "resolved Squirrel.Windows toolset directory from environment variable")
  return dir
}

/**
 * Returns the path to the squirrel.windows toolset directory. The directory
 * contains an `electron-winstaller/vendor/` subtree with all vendor executables
 * (Squirrel.exe, nuget.exe, SyncReleases.exe, 7z, etc.).
 *
 * Override with {@link ENV_KEY} for local development or to pin a custom build.
 */
export async function getSquirrelToolsetPath(): Promise<string> {
  const envPath = await resolveToolsetEnvDir()
  if (envPath != null) {
    return envPath
  }
  const toolset = "1.1.0"
  return downloadBuilderToolset({
    releaseName: `squirrel.windows@${toolset}`,
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: squirrelWindowsChecksums[toolset],
  })
}

// TEMPORARY: nuget.exe override. The published squirrel.windows@1.1.0 bundle ships the Chocolatey
// shim for nuget.exe, which resolves the real binary relative to its own install path and fails once
// relocated to a temp vendor directory. Until squirrel.windows bundles the standalone portable exe
// (electron-builder-binaries#203), download a pinned NuGet.CommandLine build at runtime and overwrite
// the bundled shim. The same win-x86 exe runs natively on Windows and under mono on Linux/macOS.
const NUGET_VERSION = "6.14.0"
const NUGET_SHA256 = "92dbed160ddee0f64b901e907439e021211b428e57c089ecc12fc38dcc4bd9a5"
const NUGET_URL = `https://dist.nuget.org/win-x86-commandline/v${NUGET_VERSION}/nuget.exe`

/**
 * Downloads (and caches) a standalone portable nuget.exe and writes it into `vendorDirectory`,
 * overwriting the broken Chocolatey shim shipped in the squirrel.windows bundle.
 */
export async function prepareNugetExe(vendorDirectory: string): Promise<void> {
  await download(NUGET_URL, path.join(vendorDirectory, "nuget.exe"), NUGET_SHA256)
}
