import { Arch, archFromString, asArray, log, spawn } from "builder-util"
import { pathExists } from "fs-extra"
import { homedir } from "os"
import * as path from "path"
import { Configuration } from "../configuration"
import * as electronRebuild from "@electron/rebuild/lib/rebuild"
import * as searchModule from "@electron/rebuild/lib/search-module"
import { EventEmitter } from "events"
import { Platform } from "../core"

export async function installOrRebuild(config: Configuration, appDir: string, options: RebuildOptions, forceInstall = false) {
  let isDependenciesInstalled = false
  for (const fileOrDir of ["node_modules", ".pnp.js"]) {
    if (await pathExists(path.join(appDir, fileOrDir))) {
      isDependenciesInstalled = true
      break
    }
  }

  if (forceInstall || !isDependenciesInstalled) {
    const effectiveOptions: RebuildOptions = {
      buildFromSource: config.buildDependenciesFromSource === true,
      additionalArgs: asArray(config.npmArgs),
      ...options,
    }
    await installDependencies(appDir, effectiveOptions)
  } else {
    const arch = archFromString(options.arch || process.arch)
    const platform = Platform.fromString(options.platform || process.platform)
    await rebuild(appDir, config.buildDependenciesFromSource === true, options.frameworkInfo, arch, platform)
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

function checkYarnBerry() {
  const npmUserAgent = process.env["npm_config_user_agent"] || ""
  const regex = /yarn\/(\d+)\./gm

  const yarnVersionMatch = regex.exec(npmUserAgent)
  const yarnMajorVersion = Number(yarnVersionMatch?.[1] ?? 0)
  return yarnMajorVersion >= 2
}

function installDependencies(appDir: string, options: RebuildOptions): Promise<any> {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const additionalArgs = options.additionalArgs

  log.info({ platform, arch, appDir }, `installing production dependencies`)
  let execPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const execArgs = ["install"]
  const isYarnBerry = checkYarnBerry()
  if (!isYarnBerry) {
    if (process.env.NPM_NO_BIN_LINKS === "true") {
      execArgs.push("--no-bin-links")
    }
    execArgs.push("--production")
  }

  if (!isRunningYarn(execPath)) {
    execArgs.push("--prefer-offline")
  }

  if (execPath == null) {
    execPath = getPackageToolPath()
  } else if (!isYarnBerry) {
    execArgs.unshift(execPath)
    execPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  if (additionalArgs != null) {
    execArgs.push(...additionalArgs)
  }
  return spawn(execPath, execArgs, {
    cwd: appDir,
    env: getGypEnv(options.frameworkInfo, platform, arch, options.buildFromSource === true),
  })
}

export async function nodeGypRebuild(frameworkInfo: DesktopFrameworkInfo, arch: Arch, platform: Platform) {
  return rebuild(process.cwd(), false, frameworkInfo, arch, platform)
}

function getPackageToolPath() {
  if (process.env.FORCE_YARN === "true") {
    return process.platform === "win32" ? "yarn.cmd" : "yarn"
  } else {
    return process.platform === "win32" ? "npm.cmd" : "npm"
  }
}

function isRunningYarn(execPath: string | null | undefined) {
  const userAgent = process.env.npm_config_user_agent
  return process.env.FORCE_YARN === "true" || (execPath != null && path.basename(execPath).startsWith("yarn")) || (userAgent != null && /\byarn\b/.test(userAgent))
}

export interface RebuildOptions {
  frameworkInfo: DesktopFrameworkInfo

  platform?: NodeJS.Platform
  arch?: string

  buildFromSource?: boolean

  additionalArgs?: Array<string> | null
}

/** @internal */
export async function rebuild(appDir: string, buildFromSource: boolean, frameworkInfo: DesktopFrameworkInfo, arch: Arch, platform: Platform) {
  log.info({ arch: Arch[arch], platform: platform.name, version: frameworkInfo.version, appDir }, "executing @electron/rebuild")
  const rootPath = await searchModule.getProjectRootPath(appDir)
  const rebuilderOptions: electronRebuild.RebuilderOptions = {
    buildPath: appDir,
    electronVersion: frameworkInfo.version,
    arch: Arch[arch],
    projectRootPath: rootPath,
    disablePreGypCopy: true,
    lifecycle: new EventEmitter(),
  }
  if (buildFromSource) {
    rebuilderOptions.prebuildTagPrefix = "totally-not-a-real-prefix-to-force-rebuild"
  }
  const rebuilder = new electronRebuild.Rebuilder(rebuilderOptions)
  rebuilder.platform = platform.nodeName
  return rebuilder.rebuild()
}
