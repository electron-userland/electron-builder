import BluebirdPromise from "bluebird-lst"
import { asArray, spawn } from "electron-builder-util"
import { exists } from "electron-builder-util/out/fs"
import { log, warn } from "electron-builder-util/out/log"
import { homedir } from "os"
import * as path from "path"
import { Config } from "./metadata"
import { readInstalled } from "./readInstalled"

export async function installOrRebuild(config: Config, appDir: string, frameworkInfo: DesktopFrameworkInfo, platform: string, arch: string, forceInstall: boolean = false) {
  const args = asArray(config.npmArgs)
  if (forceInstall || !(await exists(path.join(appDir, "node_modules")))) {
    await installDependencies(appDir, frameworkInfo, platform, arch, args, !config.npmSkipBuildFromSource)
  }
  else {
    await rebuild(appDir, frameworkInfo, platform, arch, args, !config.npmSkipBuildFromSource)
  }
}

export interface DesktopFrameworkInfo {
  version: string
  useCustomDist: boolean
}

function getElectronGypCacheDir() {
  return path.join(homedir(), ".electron-gyp")
}

export function getGypEnv(frameworkInfo: DesktopFrameworkInfo, platform: string, arch: string, buildFromSource: boolean) {
  if (!frameworkInfo.useCustomDist) {
    return Object.assign({}, process.env, {
      npm_config_arch: arch,
      npm_config_target_arch: arch,
      npm_config_platform: platform,
      npm_config_build_from_source: buildFromSource,
    })
  }

  // https://github.com/nodejs/node-gyp/issues/21
  return Object.assign({}, process.env, {
    npm_config_disturl: "https://atom.io/download/electron",
    npm_config_target: frameworkInfo.version,
    npm_config_runtime: "electron",
    npm_config_arch: arch,
    npm_config_target_arch: arch,
    npm_config_platform: platform,
    npm_config_build_from_source: buildFromSource,
    npm_config_devdir: getElectronGypCacheDir(),

  })
}

function installDependencies(appDir: string, frameworkInfo: DesktopFrameworkInfo, platform: string = process.platform, arch: string = process.arch, additionalArgs: Array<string>, buildFromSource: boolean): Promise<any> {
  log(`Installing app dependencies for arch ${arch} to ${appDir}`)
  let execPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const execArgs = ["install", "--production"]

  const isYarn = isYarnPath(execPath)
  // must be first https://github.com/electron-userland/electron-builder/issues/1626
  execArgs.push("--devdir", getElectronGypCacheDir())
  if (!isYarn) {
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

  execArgs.push(...additionalArgs)
  return spawn(execPath, execArgs, {
    cwd: appDir,
    env: getGypEnv(frameworkInfo, platform, arch, buildFromSource),
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

function isYarnPath(execPath: string | null) {
  return process.env.FORCE_YARN === "true" || (execPath != null && path.basename(execPath).startsWith("yarn"))
}

export async function rebuild(appDir: string, frameworkInfo: DesktopFrameworkInfo, platform: string = process.platform, arch: string = process.arch, additionalArgs: Array<string>, buildFromSource: boolean) {
  const pathToDep = await readInstalled(appDir)
  const nativeDeps = await BluebirdPromise.filter(pathToDep.values(), it => it.extraneous ? false : exists(path.join(it.path, "binding.gyp")), {concurrency: 8})
  if (nativeDeps.length === 0) {
    log(`No native production dependencies`)
    return
  }

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

  const env = getGypEnv(frameworkInfo, platform, arch, buildFromSource)
  if (isYarn) {
    execArgs.push("run", "install", "--")
    execArgs.push(...additionalArgs)
    await BluebirdPromise.each(nativeDeps, dep => {
      log(`Rebuilding native dependency ${dep.name}`)
      return spawn(execPath, execArgs, {
        cwd: dep.path,
        env: env,
      })
        .catch(error => {
          if (dep.optional) {
            warn(`Cannot build optional native dep ${dep.name}`)
          }
          else {
            throw error
          }
        })
    })
  }
  else {
    execArgs.push("rebuild")
    execArgs.push(...additionalArgs)
    execArgs.push(...nativeDeps.map(it => it.name))
    await spawn(execPath, execArgs, {
      cwd: appDir,
      env: env,
    })
  }
}
