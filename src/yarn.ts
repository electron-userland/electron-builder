import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { task, log } from "./util/log"
import { homedir } from "os"
import { spawn, exists } from "./util/util"

export function installDependencies(appDir: string, electronVersion: string, arch: string = process.arch, forceBuildFromSource: boolean, additionalArgs?: any): Promise<any> {
  return task(`Installing app dependencies for arch ${arch} to ${appDir}`, spawnNpmProduction(appDir, forceBuildFromSource, getGypEnv(electronVersion, arch), additionalArgs))
}

export function getGypEnv(electronVersion: string, arch: string): any {
  const gypHome = path.join(homedir(), ".electron-gyp")
  return Object.assign({}, process.env, {
    npm_config_disturl: "https://atom.io/download/electron",
    npm_config_target: electronVersion,
    npm_config_runtime: "electron",
    npm_config_arch: arch,
    HOME: gypHome,
    USERPROFILE: gypHome,
  })
}

function spawnNpmProduction(appDir: string, forceBuildFromSource: boolean, env?: any, additionalArgs?: any): Promise<any> {
  let npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const npmExecArgs = ["install", "--production"]

  const isNotYarn = npmExecPath == null || !npmExecPath.includes("yarn")
  if (isNotYarn) {
    if (process.env.NPM_NO_BIN_LINKS === "true") {
      npmExecArgs.push("--no-bin-links")
    }
    npmExecArgs.push("--cache-min", "999999999")
  }

  if (npmExecPath == null) {
    npmExecPath = process.platform === "win32" ? "npm.cmd" : "npm"
  }
  else {
    npmExecArgs.unshift(npmExecPath)
    npmExecPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }
  if (isNotYarn && forceBuildFromSource) {
    npmExecArgs.push("--build-from-source")
  }

  if (additionalArgs) {
    if (Array.isArray(additionalArgs)) {
      npmExecArgs.push(...additionalArgs)
    }
    else {
      npmExecArgs.push(additionalArgs)
    }
  }

  return spawn(npmExecPath, npmExecArgs, {
    cwd: appDir,
    env: env || process.env
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
  const deps = data.dependencies
  if (deps == null) {
    return
  }

  for (let d of Object.keys(deps)) {
    const dep = deps[d]
    if (typeof dep !== "object" || (!extraneousOnly && dep.extraneous) || seen.has(dep)) {
      continue
    }

    if (extraneousOnly === dep.extraneous) {
      seen.add(dep)
      result.add(dep.path)
    }
    else {
      flatDependencies(dep, result, seen, extraneousOnly)
    }
  }
}

export async function rebuild(appDir: string, electronVersion: string, arch: string = process.arch, additionalArgs: Array<string>) {
  const deps = new Set<string>()
  await dependencies(appDir, false, deps)
  const nativeDeps = await BluebirdPromise.filter(deps, it => exists(path.join(it, "binding.gyp")), {concurrency: 8})

  if (nativeDeps.length === 0) {
    return
  }

  log(`Rebuilding native app dependencies for arch ${arch} to ${appDir}`)

  let execPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const execArgs = ["run", "install", "--"]

  if (execPath == null) {
    if (process.env.FORCE_YARN === "true") {
      execPath = process.platform === "win32" ? "yarn.cmd" : "yarn"
    }
    else {
      execPath = process.platform === "win32" ? "npm.cmd" : "npm"
    }
  }
  else {
    execArgs.unshift(execPath)
    execPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  const gypHome = path.join(homedir(), ".electron-gyp")
  const env = Object.assign({}, process.env, {
    HOME: gypHome,
    USERPROFILE: gypHome,
  })

  execArgs.push("--disturl=https://atom.io/download/electron")
  execArgs.push(`--target=${electronVersion}`)
  execArgs.push("--runtime=electron")
  execArgs.push(`--arch=${arch}`)
  execArgs.push(...additionalArgs)

  for (let dir of nativeDeps) {
    await spawn(execPath, execArgs, {
      cwd: dir,
      env: env
    })
  }
}