import { execFile, spawn as _spawn } from "child_process"
import { Promise as BluebirdPromise } from "bluebird"
import readPackageJsonAsync = require("read-package-json")
import * as os from "os"
import * as path from "path"
import { readJson, stat } from "fs-extra-p"
import { yellow } from "chalk"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const log = console.log

export function warn(message: string) {
  console.warn(yellow(message))
}

const DEFAULT_APP_DIR_NAMES = ["app", "www"]

export const readPackageJson = BluebirdPromise.promisify(readPackageJsonAsync)

export function installDependencies(appDir: string, electronVersion: string, arch: string = process.arch, command: string = "install"): BluebirdPromise<any> {
  log((command === "install" ? "Installing" : "Rebuilding") + " app dependencies for arch %s to %s", arch, appDir)
  const gypHome = path.join(os.homedir(), ".electron-gyp")
  const env = Object.assign({}, process.env, {
    npm_config_disturl: "https://atom.io/download/atom-shell",
    npm_config_target: electronVersion,
    npm_config_runtime: "electron",
    npm_config_arch: arch,
    HOME: gypHome,
    USERPROFILE: gypHome,
  })

  let npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const npmExecArgs = [command, "--production"]
  if (npmExecPath == null) {
    npmExecPath = process.platform === "win32" ? "npm.cmd" : "npm"
  }
  else {
    npmExecArgs.unshift(npmExecPath)
    npmExecPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  return spawn(npmExecPath, npmExecArgs, {
    cwd: appDir,
    stdio: "inherit",
    env: env
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

export interface SpawnOptions extends BaseExecOptions {
  custom?: any
  detached?: boolean
}

export function exec(file: string, args?: string[], options?: ExecOptions): BluebirdPromise<Buffer[]> {
  return new BluebirdPromise<Buffer[]>((resolve, reject) => {
    execFile(file, args, options, function (error, stdout, stderr) {
      if (error == null) {
        resolve([stdout, stderr])
      }
      else {
        if (stdout.length !== 0) {
          console.log(stdout.toString())
        }
        if (stderr.length === 0) {
          reject(error)
        }
        else {
          reject(new Error(stderr.toString() + "\n" + error.toString()))
        }
      }
    })
  })
}

export function spawn(command: string, args?: string[], options?: SpawnOptions): BluebirdPromise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    const p = _spawn(command, args, options)
    p.on("close", (code: number) => code === 0 ? resolve() : reject(new Error(command + " exited with code " + code)))
  })
}

export async function getElectronVersion(packageData: any, packageJsonPath: string): Promise<string> {
  try {
    return (await readJson(path.join(path.dirname(packageJsonPath), "node_modules", "electron-prebuilt", "package.json"))).version
  }
  catch (e) {
    if (e.code !== "ENOENT") {
      warn("Cannot read electron version from electron-prebuilt package.json" + e.message)
    }
  }

  const devDependencies = packageData.devDependencies
  let electronPrebuiltDep: string = devDependencies == null ? null : devDependencies["electron-prebuilt"]
  if (electronPrebuiltDep == null) {
    const dependencies = packageData.dependencies
    electronPrebuiltDep = dependencies == null ? null : dependencies["electron-prebuilt"]
  }

  if (electronPrebuiltDep == null) {
    throw new Error("Cannot find electron-prebuilt dependency to get electron version in the '" + packageJsonPath + "'")
  }

  const firstChar = electronPrebuiltDep[0]
  return firstChar === "^" || firstChar === "~" ? electronPrebuiltDep.substring(1) : electronPrebuiltDep
}

export async function statOrNull(file: string) {
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

export async function computeDefaultAppDirectory(projectDir: string, userAppDir: string): Promise<string> {
  if (userAppDir != null) {
    const absolutePath = path.join(projectDir, userAppDir)
    const stat = await statOrNull(absolutePath)
    if (stat == null) {
      throw new Error(`Application directory ${userAppDir} doesn't exists`)
    }
    else if (!stat.isDirectory()) {
      throw new Error(`Application directory ${userAppDir} is not a directory`)
    }
    return absolutePath
  }

  for (let dir of DEFAULT_APP_DIR_NAMES) {
    const absolutePath = path.join(projectDir, dir)
    const stat = await statOrNull(absolutePath)
    if (stat != null && stat.isDirectory()) {
      return absolutePath
    }
  }
  return projectDir
}

export function use<T, R>(value: T, task: (it: T) => R): R {
  return value == null ? null : task(value)
}