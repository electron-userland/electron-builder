import { asArray, log, retry, spawn, stripSensitiveEnvVars, TmpDir } from "builder-util"
import { isNpmNoBinLinks } from "./flags.js"

import { homedir } from "os"
import * as path from "path"
import { Configuration } from "../configuration.js"
import { PM, getPackageManagerCommand } from "../node-module-collector/index.js"
import { detectPackageManager } from "../node-module-collector/packageManager.js"
import { streamSpawnToFile } from "./streamSpawnToFile.js"
import { rebuild as remoteRebuild } from "./rebuild.js"
import which from "which"
import type { RebuildOptions as ElectronRebuildOptions } from "@electron/rebuild"
import { Nullish } from "builder-util-runtime"
import _fsExtra from "fs-extra"
const { pathExists, readFile } = _fsExtra

export async function installOrRebuild(
  config: Configuration,
  { appDir, projectDir, workspaceRoot }: DirectoryPaths,
  options: RebuildOptions,
  forceInstall = false,
  env: NodeJS.ProcessEnv
) {
  const effectiveOptions: RebuildOptions = {
    buildFromSource: config.nativeModules?.buildDependenciesFromSource === true,
    additionalArgs: asArray(config.npmArgs),
    ...options,
  }
  let isDependenciesInstalled = false

  const dirsToCheck = [...new Set([projectDir, appDir, workspaceRoot].filter((d): d is string => !!d))]
  for (const fileOrDir of ["node_modules", ".pnp.js"]) {
    if ((await Promise.all(dirsToCheck.map(d => pathExists(path.join(d, fileOrDir))))).some(Boolean)) {
      isDependenciesInstalled = true

      break
    }
  }

  if (forceInstall || !isDependenciesInstalled) {
    await installDependencies(config, { appDir, projectDir, workspaceRoot }, effectiveOptions, env)
  } else {
    await rebuild(config, { appDir, projectDir, workspaceRoot }, effectiveOptions)
  }
}

export interface DesktopFrameworkInfo {
  version: string
  useCustomDist: boolean
}

function getElectronGypCacheDir() {
  return path.join(homedir(), ".electron-gyp")
}

export function getGypEnv(frameworkInfo: DesktopFrameworkInfo, platform: NodeJS.Platform, arch: string, buildFromSource: boolean) {
  const npmConfigArch = arch === "armv7l" ? "arm" : arch
  const common: any = {
    ...stripSensitiveEnvVars(process.env),
    npm_config_arch: npmConfigArch,
    npm_config_target_arch: npmConfigArch,
    npm_config_platform: platform,
    npm_config_build_from_source: buildFromSource,
    // required for node-pre-gyp
    npm_config_target_platform: platform,
    npm_config_update_binary: true,
    npm_config_fallback_to_build: true,
  }

  if (platform !== process.platform) {
    common.npm_config_force = "true"
  }
  if (platform === "win32" || platform === "darwin") {
    common.npm_config_target_libc = "unknown"
  }

  if (!frameworkInfo.useCustomDist) {
    return common
  }

  // https://github.com/nodejs/node-gyp/issues/21
  return {
    ...common,
    npm_config_disturl: common.npm_config_electron_mirror || "https://electronjs.org/headers",
    npm_config_target: frameworkInfo.version,
    npm_config_runtime: "electron",
    npm_config_devdir: getElectronGypCacheDir(),
  }
}

/**
 * Whether a failed dependency-install spawn should be retried. Everything not matched here fails fast —
 * a genuine install error (E404, ERESOLVE, EACCES, …) must surface immediately, not after 3 backoff
 * retries. Two transient classes are retriable:
 *   - Network blips while fetching from the registry.
 *   - A Windows-only cmd.exe race: cross-spawn invokes the package manager's `.cmd`/`.CMD` shim via
 *     `cmd.exe /d /s /c`, and cmd.exe re-opens the batch file between commands. Under CI load (Defender
 *     scan locks, an 8.3/temp cwd, heavy parallel I/O) that re-open intermittently fails with
 *     "The batch file cannot be found." *after* the package manager has already finished — a spurious
 *     exit code, not a missing file. The install is idempotent (a no-op once node_modules is up to
 *     date), so re-running is safe. Guarded to win32 so the narrow message match can't affect other
 *     platforms. (Durable fix: stop routing install through cmd.exe, mirroring the collector's
 *     powershell.exe -EncodedCommand spawn — tracked separately.)
 */
export function isRetriableInstallError(message: string): boolean {
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED/.test(message)) {
    return true
  }
  if (process.platform === "win32" && /The batch file cannot be found/i.test(message)) {
    return true
  }
  return false
}

export async function installDependencies(
  config: Configuration,
  { appDir, projectDir, workspaceRoot }: DirectoryPaths,
  options: RebuildOptions,
  env: NodeJS.ProcessEnv
): Promise<any> {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const additionalArgs = options.additionalArgs

  const searchPaths = [projectDir, appDir].concat(workspaceRoot ? [workspaceRoot] : [])
  const { pm, resolvedDirectory: _resolvedWorkspaceDir } = await detectPackageManager(searchPaths)

  log.info({ pm, platform, arch, projectDir, appDir, workspaceRoot: _resolvedWorkspaceDir }, "installing dependencies")

  const execArgs = ["install"]
  if (pm === PM.YARN) {
    execArgs.push("--prefer-offline")
  } else if (pm === PM.YARN_BERRY) {
    if (isNpmNoBinLinks()) {
      execArgs.push("--no-bin-links")
    }
  }

  const execPath = getPackageManagerCommand(pm)

  if (additionalArgs != null) {
    execArgs.push(...additionalArgs)
  }

  const spawnEnv = {
    ...getGypEnv(options.frameworkInfo, platform, arch, options.buildFromSource === true),
    ...env,
    // Silence corepack's activation/download chatter so a `pnpm install` doesn't flood the build log;
    // strict=0 so the app's `packageManager` pin can't abort the install, download prompt/notice off.
    COREPACK_ENABLE_STRICT: "0",
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  }

  const tmpDir = new TmpDir("install-dependencies")
  try {
    await retry(
      async () => {
        // Stream install output to a file instead of inheriting/buffering it: corepack and the package
        // managers are extremely chatty, so the common (success) path stays quiet and only surfaces the
        // log on failure. On Windows streamSpawnToFile routes through powershell.exe -EncodedCommand
        // rather than cmd.exe, which also sidesteps the spurious ".cmd" shim "batch file cannot be
        // found." re-open race that previously forced the win32 retry guard below.
        const outputFile = await tmpDir.getTempFile({ prefix: "install-", suffix: ".log" })
        const { code, stderr } = await streamSpawnToFile(execPath, execArgs, appDir, outputFile, spawnEnv)
        if (code !== 0) {
          const stdout = await readFile(outputFile, "utf8").catch(() => "")
          throw new Error(`Package install (${execPath} ${execArgs.join(" ")}) exited with code ${code}:\n${stdout}\n${stderr}`)
        }
        if (log.isDebugEnabled) {
          const stdout = await readFile(outputFile, "utf8").catch(() => "")
          log.debug({ stdout, stderr }, "installed dependencies")
        }
      },
      {
        retries: 3,
        interval: 1000,
        backoff: 2000,
        shouldRetry: (e: any) => {
          const message = e?.message ?? ""
          const retriable = isRetriableInstallError(message)
          if (retriable) {
            log.warn({ error: String(message).split("\n")[0] }, "transient error during package install, retrying")
          }
          return retriable
        },
      }
    )
  } finally {
    await tmpDir.cleanup()
  }

  // Some native dependencies no longer use `install` hook for building their native module, (yarn 3+ removed implicit link of `install` and `rebuild` steps)
  // https://github.com/electron-userland/electron-builder/issues/8024
  return rebuild(config, { appDir, projectDir, workspaceRoot }, options)
}

export async function nodeGypRebuild(platform: NodeJS.Platform, arch: string, frameworkInfo: DesktopFrameworkInfo) {
  log.info({ platform, arch }, "executing node-gyp rebuild")
  // this script must be used only for electron
  const nodeGyp = process.platform === "win32" ? which.sync("node-gyp") : "node-gyp"
  const args = ["rebuild"]
  // headers of old Electron versions do not have a valid config.gypi file
  // and --force-process-config must be passed to node-gyp >= 8.4.0 to
  // correctly build modules for them.
  // see also https://github.com/nodejs/node-gyp/pull/2497
  const [major, minor] = frameworkInfo.version
    .split(".")
    .slice(0, 2)
    .map(n => parseInt(n, 10))
  if (major <= 13 || (major == 14 && minor <= 1) || (major == 15 && minor <= 2)) {
    args.push("--force-process-config")
  }
  await spawn(nodeGyp, args, { env: getGypEnv(frameworkInfo, platform, arch, true) })
}
export interface RebuildOptions {
  frameworkInfo: DesktopFrameworkInfo

  platform?: NodeJS.Platform
  arch?: string

  buildFromSource?: boolean

  additionalArgs?: Array<string> | null
}

export interface DirectoryPaths {
  appDir: string
  projectDir: string
  workspaceRoot: string | Nullish
}

/** @internal */
export async function rebuild(config: Configuration, { appDir, projectDir, workspaceRoot }: DirectoryPaths, options: RebuildOptions) {
  const buildFromSource = options.buildFromSource === true
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch

  const {
    frameworkInfo: { version: electronVersion },
  } = options
  const projectRootPath = workspaceRoot || projectDir || appDir
  const logInfo = {
    electronVersion,
    arch,
    buildFromSource,
    workspaceRoot,
    projectDir: log.filePath(projectDir) || "./",
    appDir: log.filePath(appDir) || "./",
  }
  log.info(logInfo, "executing @electron/rebuild")

  const mode = config.nativeModules?.rebuildMode ?? "sequential"
  const rebuildOptions: ElectronRebuildOptions = {
    buildPath: appDir,
    electronVersion,
    arch,
    platform,
    buildFromSource,
    projectRootPath,
    mode,
    disablePreGypCopy: true,
  }
  return remoteRebuild(rebuildOptions)
}
