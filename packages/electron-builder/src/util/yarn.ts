import BluebirdPromise from "bluebird-lst"
import { asArray, log, spawn, warn } from "builder-util"
import { exists } from "builder-util/out/fs"
import { Lazy } from "lazy-val"
import { homedir } from "os"
import * as path from "path"
import { Configuration } from "../configuration"
import { Dependency } from "./packageDependencies"

/** @internal */
export async function installOrRebuild(config: Configuration, appDir: string, options: RebuildOptions, forceInstall: boolean = false) {
  const effectiveOptions = {
    buildFromSource: config.buildDependenciesFromSource === true,
    additionalArgs: asArray(config.npmArgs), ...options
  }

  if (forceInstall || !(await exists(path.join(appDir, "node_modules")))) {
    await installDependencies(appDir, effectiveOptions)
  }
  else {
    await rebuild(appDir, effectiveOptions)
  }
}

/** @internal */
export interface DesktopFrameworkInfo {
  version: string
  useCustomDist: boolean
}

function getElectronGypCacheDir() {
  return path.join(homedir(), ".electron-gyp")
}

/** @internal */
export function getGypEnv(frameworkInfo: DesktopFrameworkInfo, platform: string, arch: string, buildFromSource: boolean) {
  if (!frameworkInfo.useCustomDist) {
    return {
      ...process.env,
      npm_config_arch: arch,
      npm_config_target_arch: arch,
      npm_config_platform: platform,
      npm_config_build_from_source: buildFromSource
    }
  }

  // https://github.com/nodejs/node-gyp/issues/21
  return {
    ...process.env,
    npm_config_disturl: "https://atom.io/download/electron",
    npm_config_target: frameworkInfo.version,
    npm_config_runtime: "electron",
    npm_config_arch: arch,
    npm_config_target_arch: arch,
    npm_config_platform: platform,
    // required for node-pre-gyp
    npm_config_target_platform: platform,
    npm_config_fallback_to_build: true,
    npm_config_build_from_source: buildFromSource,
    npm_config_devdir: getElectronGypCacheDir(),
  }
}

function installDependencies(appDir: string, options: RebuildOptions): Promise<any> {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const additionalArgs = options.additionalArgs

  log(`Installing app dependencies for ${platform}:${arch} to ${appDir}`)
  let execPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const execArgs = ["install", "--production"]

  if (!isYarnPath(execPath)) {
    if (process.env.NPM_NO_BIN_LINKS === "true") {
      execArgs.push("--no-bin-links")
    }
    execArgs.push("--cache-min", "999999999")
  }

  if (execPath == null) {
    execPath = getPackageToolPath()
  }
  else {
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

function getPackageToolPath() {
  if (process.env.FORCE_YARN === "true") {
    return process.platform === "win32" ? "yarn.cmd" : "yarn"
  }
  else {
    return process.platform === "win32" ? "npm.cmd" : "npm"
  }
}

function isYarnPath(execPath: string | null | undefined) {
  return process.env.FORCE_YARN === "true" || (execPath != null && path.basename(execPath).startsWith("yarn"))
}

export interface RebuildOptions {
  frameworkInfo: DesktopFrameworkInfo
  productionDeps?: Lazy<Array<Dependency>>

  platform?: string
  arch?: string

  buildFromSource?: boolean

  additionalArgs?: Array<string> | null
}

/** @internal */
export async function rebuild(appDir: string, options: RebuildOptions) {
  const nativeDeps = await BluebirdPromise.filter(await options.productionDeps!.value, it => exists(path.join(it.path, "binding.gyp")), {concurrency: 8})
  if (nativeDeps.length === 0) {
    log(`No native production dependencies`)
    return
  }

  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const additionalArgs = options.additionalArgs

  log(`Rebuilding native production dependencies for ${platform}:${arch}`)

  let execPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const isYarn = isYarnPath(execPath)
  const execArgs: Array<string> = []
  if (execPath == null) {
    execPath = getPackageToolPath()
  }
  else {
    execArgs.push(execPath)
    execPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  const env = getGypEnv(options.frameworkInfo, platform, arch, options.buildFromSource === true)
  if (isYarn) {
    execArgs.push("run", "install", "--")
    if (additionalArgs != null) {
      execArgs.push(...additionalArgs)
    }
    await BluebirdPromise.map(nativeDeps, dep => {
      log(`Rebuilding native dependency ${dep.name}`)
      return spawn(execPath!, execArgs, {
        cwd: dep.path,
        env,
      })
        .catch(error => {
          if (dep.optional) {
            warn(`Cannot build optional native dep ${dep.name}`)
          }
          else {
            throw error
          }
        })
    }, {concurrency: process.platform === "win32" ? 1 : 2})
  }
  else {
    execArgs.push("rebuild")
    if (additionalArgs != null) {
      execArgs.push(...additionalArgs)
    }
    execArgs.push(...nativeDeps.map(it => `${it.name}@${it.version}`))
    await spawn(execPath, execArgs, {
      cwd: appDir,
      env,
    })
  }
}
