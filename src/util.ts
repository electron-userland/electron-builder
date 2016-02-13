import { execFile, spawn as _spawn } from "child_process"
import { Promise as BluebirdPromise } from "bluebird"
import "source-map-support/register"

export const log = console.log

BluebirdPromise.config({
  longStackTraces: true,
  cancellation: true
})

export const DEFAULT_APP_DIR_NAME = "app"

export const commonArgs: any[] = [{
  name: "appDir",
  type: String,
  description: "Relative (to the working directory) path to the folder containing the application package.json. Working directory or app/ by default."
}]

const execFileAsync: (file: string, args?: string[], options?: ExecOptions) => BluebirdPromise<Buffer[]> = (<any>BluebirdPromise.promisify(execFile, {multiArgs: true}))

export function installDependencies(appDir: string, arch: string, electronVersion: string): BluebirdPromise<any> {
  log("Installing app dependencies for arch %s to %s", arch || process.arch, appDir)
  const env = Object.assign({}, process.env, {
    npm_config_disturl: "https://atom.io/download/atom-shell",
    npm_config_target: electronVersion,
    npm_config_runtime: "electron",
    HOME: require("os").homedir() + "/.electron-gyp",
  })

  if (arch != null) {
    env.npm_config_arch = arch
  }

  let npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const npmExecArgs = ["install"]
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

interface BaseExecOptions {
  cwd?: string
  env?: any
  stdio?: any
}

interface ExecOptions extends BaseExecOptions {
  customFds?: any
  encoding?: string
  timeout?: number
  maxBuffer?: number
  killSignal?: string
}

interface SpawnOptions extends BaseExecOptions {
  custom?: any
  detached?: boolean
}

export function exec(file: string, args?: string[], options?: ExecOptions): BluebirdPromise<Buffer[]> {
  return execFileAsync(file, args, options)
}

export function spawn(command: string, args?: string[], options?: SpawnOptions): BluebirdPromise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    const p = _spawn(command, args, options)
    p.on("close", (code: number) => code === 0 ? resolve() : reject(new Error(command + " exited with code " + code)))
  })
}

export function getElectronVersion(packageData: any, filePath: string): string {
  const devDependencies = packageData.devDependencies
  let electronPrebuiltDep = devDependencies == null ? null : devDependencies["electron-prebuilt"]
  if (electronPrebuiltDep == null) {
    const dependencies = packageData.dependencies
    electronPrebuiltDep = dependencies == null ? null : dependencies["electron-prebuilt"]
  }

  if (electronPrebuiltDep == null) {
    throw new Error("Cannot find electron-prebuilt dependency to get electron version in the '" + filePath + "'")
  }
  return electronPrebuiltDep.substring(1)
}