import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { log } from "./util/log"
import { homedir } from "os"
import { spawn, asArray } from "./util/util"
import { BuildMetadata } from "./metadata"
import { exists } from "./util/fs"

export async function installOrRebuild(options: BuildMetadata, appDir: string, electronVersion: string, platform: string, arch: string, forceInstall: boolean = false) {
  const args = asArray(options.npmArgs)
  if (forceInstall || !(await exists(path.join(appDir, "node_modules")))) {
    await installDependencies(appDir, electronVersion, platform, arch, args, !options.npmSkipBuildFromSource)
  }
  else {
    await rebuild(appDir, electronVersion, platform, arch, args, !options.npmSkipBuildFromSource)
  }
}

export function getGypEnv(electronVersion: string, platform: string, arch: string, buildFromSource: boolean) {
  const gypHome = path.join(homedir(), ".electron-gyp")
  return Object.assign({}, process.env, {
    npm_config_disturl: "https://atom.io/download/electron",
    npm_config_target: electronVersion,
    npm_config_runtime: "electron",
    npm_config_arch: arch,
    npm_config_target_arch: arch,
    npm_config_platform: platform,
    npm_config_build_from_source: buildFromSource,
    HOME: gypHome,
    USERPROFILE: gypHome,
  })
}

function installDependencies(appDir: string, electronVersion: string, platform: string = process.platform, arch: string = process.arch, additionalArgs: Array<string>, buildFromSource: boolean): Promise<any> {
  log(`Installing app dependencies for arch ${arch} to ${appDir}`)
  let execPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const execArgs = ["install", "--production"]

  const isYarn = isYarnPath(execPath)
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
    env: getGypEnv(electronVersion, platform, arch, buildFromSource),
  })
}

let readInstalled: any = null
export function dependencies(dir: string, extraneousOnly: boolean, result: Set<string>): Promise<Array<string>> {
  if (readInstalled == null) {
    readInstalled = BluebirdPromise.promisify(require("read-installed"))
  }
  return readInstalled(dir)
    .then((it: any) => flatDependencies(it, result, new Set(), extraneousOnly))
}

function flatDependencies(data: any, result: Set<string>, seen: Set<string>, extraneousOnly: boolean): void {
  if (data.dependencies == null) {
    return
  }

  const queue: Array<any> = [data.dependencies]
  while (queue.length > 0) {
    const deps = queue.pop()
    for (const name of Object.keys(deps)) {
      const dep = deps[name]
      if (typeof dep !== "object" || (!extraneousOnly && dep.extraneous) || seen.has(dep)) {
        continue
      }

      seen.add(dep)

      if (extraneousOnly === dep.extraneous) {
        result.add(dep.path)
      }
      else {
        const childDeps = dep.dependencies
        if (childDeps != null) {
          queue.push(childDeps)
        }
      }
    }
  }
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
  return execPath != null && path.basename(execPath).startsWith("yarn")
}

export async function rebuild(appDir: string, electronVersion: string, platform: string = process.platform, arch: string = process.arch, additionalArgs: Array<string>, buildFromSource: boolean) {
  const deps = new Set<string>()
  await dependencies(appDir, false, deps)
  const nativeDeps = await BluebirdPromise.filter(deps, it => exists(path.join(it, "binding.gyp")), {concurrency: 8})

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

  const env = getGypEnv(electronVersion, platform, arch, buildFromSource)
  if (isYarn) {
    execArgs.push("run", "install", "--")
    execArgs.push(...additionalArgs)
    await BluebirdPromise.each(nativeDeps, it => spawn(execPath, execArgs, {cwd: it, env: env}))
  }
  else {
    execArgs.push("rebuild")
    execArgs.push(...additionalArgs)
    execArgs.push(...nativeDeps.map(it => path.basename(it)))
    await spawn(execPath, execArgs, {cwd: appDir, env: env})
  }
}
