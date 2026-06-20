import { download, downloadBuilderToolset } from "app-builder-lib/internal"
import { exists, log, parseValidEnvVarUrl, resolveEnvShellValue } from "builder-util"
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
//
// TODO(remove after squirrel.windows@1.1.1): once electron-builder-binaries#203 ships the pinned
// nuget.exe in the bundle, delete prepareNugetExe + isUsableNuget + the NUGET_* constants/env vars
// and bump getSquirrelToolsetPath's `toolset` to that release. (isUsableNuget already makes this a
// no-op against such a bundle, so the runtime download stops on its own once the version is bumped.)
const NUGET_VERSION = "6.14.0"
const NUGET_SHA256 = "92dbed160ddee0f64b901e907439e021211b428e57c089ecc12fc38dcc4bd9a5"
const NUGET_URL = `https://dist.nuget.org/win-x86-commandline/v${NUGET_VERSION}/nuget.exe`
// Redirect the nuget.exe download for air-gapped / mirrored builds.
const NUGET_URL_ENV = "ELECTRON_BUILDER_SQUIRREL_NUGET_URL"
const NUGET_SHA256_ENV = "ELECTRON_BUILDER_SQUIRREL_NUGET_SHA256"
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
 * Ensures `vendorDirectory` holds a usable standalone nuget.exe. If the bundle already ships a real one
 * (e.g. a future squirrel.windows release, or a pre-staged offline toolset dir), it is kept as-is.
 * Otherwise a pinned NuGet.CommandLine build is downloaded and cached, replacing the broken Chocolatey
 * shim. Air-gapped/mirrored builds can redirect the download with {@link NUGET_URL_ENV} (and
 * {@link NUGET_SHA256_ENV} to supply a non-default build's checksum, or an empty value to skip it).
 */
export async function prepareNugetExe(vendorDirectory: string): Promise<void> {
  const target = path.join(vendorDirectory, "nuget.exe")
  if (await isUsableNuget(target)) {
    return
  }
  const overrideUrl = parseValidEnvVarUrl(NUGET_URL_ENV)
  const url = overrideUrl ?? NUGET_URL
  // The pinned hash matches the official 6.14.0 build and any plain mirror of it. For a different
  // build, set NUGET_SHA256_ENV to its sha256 (an empty value disables verification).
  const shaOverride = overrideUrl != null ? process.env[NUGET_SHA256_ENV]?.trim() : undefined
  const checksum = shaOverride !== undefined ? shaOverride || null : NUGET_SHA256
  await download(url, target, checksum)
}
