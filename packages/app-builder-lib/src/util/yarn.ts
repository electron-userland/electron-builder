import { asArray, log, spawn } from "builder-util"
import { pathExists } from "fs-extra"
import { Lazy } from "lazy-val"
import { homedir } from "os"
import * as path from "path"
import { Configuration } from "../configuration"
import { NodeModuleDirInfo } from "./packageDependencies"
import * as electronRebuild from "@electron/rebuild"
import { getProjectRootPath } from "@electron/rebuild/lib/search-module"
import { rebuild as remoteRebuild } from "./rebuild/rebuild"
import { executeAppBuilderAndWriteJson } from "./appBuilder"
import { RebuildMode } from "@electron/rebuild/lib/types"
import { PM, detect, getPackageManagerVersion } from "../node-module-collector"

export async function installOrRebuild(config: Configuration, appDir: string, options: RebuildOptions, forceInstall = false) {
  const effectiveOptions: RebuildOptions = {
    buildFromSource: config.buildDependenciesFromSource === true,
    additionalArgs: asArray(config.npmArgs),
    ...options,
  }
  let isDependenciesInstalled = false

  for (const fileOrDir of ["node_modules", ".pnp.js"]) {
    if (await pathExists(path.join(appDir, fileOrDir))) {
      isDependenciesInstalled = true

      break
    }
  }

  if (forceInstall || !isDependenciesInstalled) {
    await installDependencies(config, appDir, effectiveOptions)
  } else {
    await rebuild(config, appDir, effectiveOptions)
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
    ...process.env,
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
    npm_config_disturl: "https://electronjs.org/headers",
    npm_config_target: frameworkInfo.version,
    npm_config_runtime: "electron",
    npm_config_devdir: getElectronGypCacheDir(),
  }
}

async function checkYarnBerry(pm: PM) {
  if (pm !== "yarn") {
    return false
  }
  const version = await getPackageManagerVersion(pm)
  if (version == null || version.split(".").length < 1) {
    return false
  }

  return version.split(".")[0] >= "2"
}

async function installDependencies(config: Configuration, appDir: string, options: RebuildOptions): Promise<any> {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const additionalArgs = options.additionalArgs

  log.info({ platform, arch, appDir }, `installing production dependencies`)
  const pm = await detect({ cwd: appDir })
  const execArgs = ["install"]
  const isYarnBerry = await checkYarnBerry(pm)
  if (!isYarnBerry) {
    if (process.env.NPM_NO_BIN_LINKS === "true") {
      execArgs.push("--no-bin-links")
    }
  }

  if (!isRunningYarn(pm)) {
    execArgs.push("--prefer-offline")
  }

  const execPath = getPackageToolPath(pm)

  if (additionalArgs != null) {
    execArgs.push(...additionalArgs)
  }
  await spawn(execPath, execArgs, {
    cwd: appDir,
    env: getGypEnv(options.frameworkInfo, platform, arch, options.buildFromSource === true),
  })

  // Some native dependencies no longer use `install` hook for building their native module, (yarn 3+ removed implicit link of `install` and `rebuild` steps)
  // https://github.com/electron-userland/electron-builder/issues/8024
  return rebuild(config, appDir, options)
}

export async function nodeGypRebuild(platform: NodeJS.Platform, arch: string, frameworkInfo: DesktopFrameworkInfo) {
  log.info({ platform, arch }, "executing node-gyp rebuild")
  // this script must be used only for electron
  const nodeGyp = `node-gyp${process.platform === "win32" ? ".cmd" : ""}`
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

function getPackageToolPath(pm: PM) {
  let cmd = pm
  if (process.env.FORCE_YARN === "true") {
    cmd = "yarn"
  }
  return `${cmd}${process.platform === "win32" ? ".cmd" : ""}`
}

function isRunningYarn(pm: PM) {
  const userAgent = process.env.npm_config_user_agent
  return process.env.FORCE_YARN === "true" || pm === "yarn" || (userAgent != null && /\byarn\b/.test(userAgent))
}

export interface RebuildOptions {
  frameworkInfo: DesktopFrameworkInfo
  productionDeps: Lazy<Array<NodeModuleDirInfo>>

  platform?: NodeJS.Platform
  arch?: string

  buildFromSource?: boolean

  additionalArgs?: Array<string> | null
}

/** @internal */
export async function rebuild(config: Configuration, appDir: string, options: RebuildOptions) {
  const configuration = {
    dependencies: await options.productionDeps.value,
    nodeExecPath: process.execPath,
    platform: options.platform || process.platform,
    arch: options.arch || process.arch,
    additionalArgs: options.additionalArgs,
    execPath: process.env.npm_execpath || process.env.NPM_CLI_JS,
    buildFromSource: options.buildFromSource === true,
  }
  const { arch, buildFromSource, platform } = configuration

  if (config.nativeRebuilder === "legacy") {
    const env = getGypEnv(options.frameworkInfo, platform, arch, buildFromSource)
    return executeAppBuilderAndWriteJson(["rebuild-node-modules"], configuration, { env, cwd: appDir })
  }

  const {
    frameworkInfo: { version: electronVersion },
  } = options
  const logInfo = {
    electronVersion,
    arch,
    buildFromSource,
    appDir: log.filePath(appDir) || "./",
  }
  log.info(logInfo, "executing @electron/rebuild")

  const rebuildOptions: electronRebuild.RebuildOptions = {
    buildPath: appDir,
    electronVersion,
    arch,
    platform,
    buildFromSource,
    projectRootPath: await getProjectRootPath(appDir),
    mode: (config.nativeRebuilder as RebuildMode) || "sequential",
    disablePreGypCopy: true,
  }
  return remoteRebuild(rebuildOptions)
}
