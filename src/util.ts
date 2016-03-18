import { execFile, spawn as _spawn } from "child_process"
import { Promise as BluebirdPromise } from "bluebird"
import readPackageJsonAsync = require("read-package-json")
import * as os from "os"
import * as path from "path"
import { readJson } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const log = console.log

export const DEFAULT_APP_DIR_NAME = "app"

export const commonArgs: any[] = [{
  name: "appDir",
  type: String,
  description: "Relative (to the working directory) path to the folder containing the application package.json. Working directory or app/ by default."
}]

export const readPackageJson = BluebirdPromise.promisify(readPackageJsonAsync)

export function installDependencies(appDir: string, electronVersion: string, arch: string = process.arch, command: string = "install"): BluebirdPromise<any> {
  log("Installing app dependencies for arch %s to %s", arch, appDir)
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
    npmExecPath = "npm"
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
          console.error(stdout.toString())
        }
        if (stderr.length !== 0) {
          console.error(stderr.toString())
        }
        reject(error)
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
    // ignore
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