import { execFile, spawn as _spawn, ChildProcess, SpawnOptions } from "child_process"
import { Promise as BluebirdPromise } from "bluebird"
import { homedir } from "os"
import * as path from "path"
import { readJson, stat, Stats, unlink } from "fs-extra-p"
import { yellow, red } from "chalk"
import debugFactory = require("debug")
import { warn, task, log } from "./log"
import { createHash } from "crypto"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const debug = debugFactory("electron-builder")
export const debug7z = debugFactory("electron-builder:7z")

const DEFAULT_APP_DIR_NAMES = ["app", "www"]

export function installDependencies(appDir: string, electronVersion: string, arch: string = process.arch, command: string = "install"): BluebirdPromise<any> {
  return task(`${(command === "install" ? "Installing" : "Rebuilding")} app dependencies for arch ${arch} to ${appDir}`, spawnNpmProduction(command, appDir, getGypEnv(electronVersion, arch)))
}

export function getGypEnv(electronVersion: string, arch: string): any {
  const gypHome = path.join(homedir(), ".electron-gyp")
  return Object.assign({}, process.env, {
    npm_config_disturl: "https://atom.io/download/atom-shell",
    npm_config_target: electronVersion,
    npm_config_runtime: "electron",
    npm_config_arch: arch,
    HOME: gypHome,
    USERPROFILE: gypHome,
  })
}

export function spawnNpmProduction(command: string, appDir: string, env?: any): BluebirdPromise<any> {
  let npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const npmExecArgs = [command, "--production", "--build-from-source", "--cache-min", "999999999"]
  if (npmExecPath == null) {
    npmExecPath = process.platform === "win32" ? "npm.cmd" : "npm"
  }
  else {
    npmExecArgs.unshift(npmExecPath)
    npmExecPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  return spawn(npmExecPath, npmExecArgs, {
    cwd: appDir,
    env: env || process.env
  })
}

export interface BaseExecOptions {
  cwd?: string
  env?: any
  stdio?: any
}

export interface ExecOptions extends BaseExecOptions {
  customFds?: any
  encoding?: string
  timeout?: number
  maxBuffer?: number
  killSignal?: string
}

export function removePassword(input: string): string {
  return input.replace(/(-P |pass:|\/p|-pass )([^ ]+)/, function (match, p1, p2) {
    return `${p1}${createHash("sha256").update(p2).digest("hex")} (sha256 hash)`
  })
}

export function exec(file: string, args?: Array<string> | null, options?: ExecOptions): BluebirdPromise<string> {
  if (debug.enabled) {
    debug(`Executing ${file} ${args == null ? "" : removePassword(args.join(" "))}`)
  }

  return new BluebirdPromise<string>((resolve, reject) => {
    execFile(file, <any>args, options, function (error, stdout, stderr) {
      if (error == null) {
        if (debug.enabled) {
          if (stderr.length !== 0) {
            log(stderr)
          }
        }
        resolve(stdout)
      }
      else {
        let message = red(removePassword(error.message))
        if (stdout.length !== 0) {
          message += `\n${yellow(stdout)}`
        }
        if (stderr.length !== 0) {
          message += `\n${red(stderr)}`
        }

        reject(new Error(message))
      }
    })
  })
}

export function doSpawn(command: string, args: Array<string>, options?: SpawnOptions, pipeInput?: Boolean): ChildProcess {
  if (options == null) {
    options = {}
  }
  if (options.stdio == null) {
    options.stdio = [pipeInput ? "pipe" : "ignore", debug.enabled ? "inherit" : "pipe", "pipe"]
  }

  if (debug.enabled) {
    debug(`Spawning ${command} ${removePassword(args.join(" "))}`)
  }
  return _spawn(command, args, options)
}

export function spawn(command: string, args?: Array<string> | null, options?: SpawnOptions): BluebirdPromise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    handleProcess("close", doSpawn(command, args || [], options), command, resolve, reject)
  })
}

export function handleProcess(event: string, childProcess: ChildProcess, command: string, resolve: ((value?: any) => void) | null, reject: (reason?: any) => void) {
  childProcess.on("error", reject)

  let out = ""
  if (!debug.enabled && childProcess.stdout != null) {
    childProcess.stdout.on("data", (data: string) => {
      out += data
    })
  }

  let errorOut = ""
  if (childProcess.stderr != null) {
    childProcess.stderr.on("data", (data: string) => {
      errorOut += data
    })
  }

  childProcess.once(event, (code: number) => {
    if (code === 0 && debug.enabled) {
      debug(`${command} (${childProcess.pid}) exited with code ${code}`)
    }

    if (code !== 0) {
      function formatOut(text: string, title: string) {
        if (text.length === 0) {
          return ""
        }
        else {
          return `\n${title}:\n${text}`
        }
      }

      reject(new Error(`${command} exited with code ${code}${formatOut(out, "Output")}${formatOut(errorOut, "Error output")}`))
    }
    else if (resolve != null) {
      resolve()
    }
  })
}

export async function getElectronVersion(packageData: any, packageJsonPath: string): Promise<string> {
  const build = packageData.build
  // build is required, but this check is performed later, so, we should check for null
  if (build != null && build.electronVersion != null) {
    return build.electronVersion
  }

  for (let name of ["electron", "electron-prebuilt", "electron-prebuilt-compile"]) {
    try {
      return (await readJson(path.join(path.dirname(packageJsonPath), "node_modules", name, "package.json"))).version
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        warn(`Cannot read electron version from ${name} package.json: ${e.message}`)
      }
    }
  }

  const electronPrebuiltDep = findFromElectronPrebuilt(packageData)
  if (electronPrebuiltDep == null) {
    throw new Error("Cannot find electron dependency to get electron version in the '" + packageJsonPath + "'")
  }

  const firstChar = electronPrebuiltDep[0]
  return firstChar === "^" || firstChar === "~" ? electronPrebuiltDep.substring(1) : electronPrebuiltDep
}

function findFromElectronPrebuilt(packageData: any): any {
  for (let name of ["electron", "electron-prebuilt", "electron-prebuilt-compile"]) {
    const devDependencies = packageData.devDependencies
    let dep = devDependencies == null ? null : devDependencies[name]
    if (dep == null) {
      const dependencies = packageData.dependencies
      dep = dependencies == null ? null : dependencies[name]
    }
    if (dep != null) {
      return dep
    }
  }
  return null
}

export async function statOrNull(file: string): Promise<Stats | null> {
  try {
    return await stat(file)
  }
  catch (e) {
    if (e.code === "ENOENT") {
      return null
    }
    else {
      throw e
    }
  }
}

export async function computeDefaultAppDirectory(projectDir: string, userAppDir: string | null | undefined): Promise<string> {
  if (userAppDir != null) {
    const absolutePath = path.resolve(projectDir, userAppDir)
    const stat = await statOrNull(absolutePath)
    if (stat == null) {
      throw new Error(`Application directory ${userAppDir} doesn't exists`)
    }
    else if (!stat.isDirectory()) {
      throw new Error(`Application directory ${userAppDir} is not a directory`)
    }
    else if (projectDir === absolutePath) {
      warn(`Specified application directory "${userAppDir}" equals to project dir — superfluous or wrong configuration`)
    }
    return absolutePath
  }

  for (let dir of DEFAULT_APP_DIR_NAMES) {
    const absolutePath = path.join(projectDir, dir)
    const packageJson = path.join(absolutePath, "package.json")
    const stat = await statOrNull(packageJson)
    if (stat != null && stat.isFile()) {
      return absolutePath
    }
  }
  return projectDir
}

export function use<T, R>(value: T | null, task: (it: T) => R): R | null {
  return value == null ? null : task(value)
}

export function debug7zArgs(command: "a" | "x"): Array<string> {
  const args = [command, "-bd"]
  if (debug7z.enabled) {
    args.push("-bb3")
  }
  else if (!debug.enabled) {
    args.push("-bb0")
  }
  return args
}

let tmpDirCounter = 0
// add date to avoid use stale temp dir
const tempDirPrefix = `${process.pid.toString(16)}-${Date.now().toString(16)}`

export function getTempName(prefix?: string | n): string {
  return `${prefix == null ? "" : `${prefix}-`}${tempDirPrefix}-${(tmpDirCounter++).toString(16)}`
}

export function isEmptyOrSpaces(s: string | n) {
  return s == null || s.trim().length === 0
}

export function unlinkIfExists(file: string) {
  return unlink(file)
    .catch(() => {
      // ignore
    })
}

export function asArray<T>(v: n | T | Array<T>): Array<T> {
  if (v == null) {
    return []
  }
  else if (Array.isArray(v)) {
    return v
  }
  else {
    return [v]
  }
}
export function isCi(): boolean {
  return (process.env.CI || "").toLowerCase() === "true"
}