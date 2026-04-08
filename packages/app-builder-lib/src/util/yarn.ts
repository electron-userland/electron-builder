import { asArray, log, spawn } from "builder-util"
import { pathExists } from "fs-extra"
import { Lazy } from "lazy-val"
import { homedir } from "os"
import * as path from "path"
import { Configuration } from "../configuration.js"
import { executeAppBuilderAndWriteJson } from "./appBuilder.js"
import { PM, getPackageManagerCommand } from "../node-module-collector/index.js"
import { detectPackageManager } from "../node-module-collector/packageManager.js"
import { NodeModuleDirInfo } from "./packageDependencies.js"
import { rebuild as remoteRebuild } from "./rebuild.js"
import * as which from "which"
import { RebuildOptions as ElectronRebuildOptions } from "@electron/rebuild"
import { Nullish } from "builder-util-runtime"

export async function installOrRebuild(
  config: Configuration,
  { appDir, projectDir, workspaceRoot }: DirectoryPaths,
  options: RebuildOptions,
  forceInstall = false,
  env: NodeJS.ProcessEnv
) {
  const effectiveOptions: RebuildOptions = {
    buildFromSource: config.buildDependenciesFromSource === true,
    additionalArgs: asArray(config.npmArgs),
    ...options,
  }
  let isDependenciesInstalled = false

  for (const fileOrDir of ["node_modules", ".pnp.js"]) {
    if ((await pathExists(path.join(projectDir, fileOrDir))) || (await pathExists(path.join(appDir, fileOrDir)))) {
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
    npm_config_disturl: common.npm_config_electron_mirror || "https://electronjs.org/headers",
    npm_config_target: frameworkInfo.version,
    npm_config_runtime: "electron",
    npm_config_devdir: getElectronGypCacheDir(),
  }
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
    if (process.env.NPM_NO_BIN_LINKS === "true") {
      execArgs.push("--no-bin-links")
    }
  }

  const execPath = getPackageManagerCommand(pm)

  if (additionalArgs != null) {
    execArgs.push(...additionalArgs)
  }

  await spawn(execPath, execArgs, {
    cwd: appDir,
    env: {
      ...getGypEnv(options.frameworkInfo, platform, arch, options.buildFromSource === true),
      ...env,
    },
  })

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
  productionDeps: Lazy<Array<NodeModuleDirInfo>>

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

  if (config.nativeRebuilder === "legacy") {
    const configuration = {
      platform,
      arch,
      buildFromSource,
      dependencies: await options.productionDeps.value,
      nodeExecPath: process.execPath,
      additionalArgs: options.additionalArgs,
      execPath: process.env.npm_execpath || process.env.NPM_CLI_JS,
    }
    const env = getGypEnv(options.frameworkInfo, platform, arch, buildFromSource)
    return executeAppBuilderAndWriteJson(["rebuild-node-modules"], configuration, { env, cwd: appDir })
  }

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

  const rebuildOptions: ElectronRebuildOptions = {
    buildPath: appDir,
    electronVersion,
    arch,
    platform,
    buildFromSource,
    projectRootPath,
    mode: config.nativeRebuilder || "sequential",
    disablePreGypCopy: true,
  }
  return remoteRebuild(rebuildOptions)
}
