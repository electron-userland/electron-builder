import { exec, spawn, ExecOptions, DebugLogger, ExtraSpawnOptions } from "builder-util"
import { SpawnOptions, execFileSync } from "child_process"
import * as path from "path"

async function parseVmList(debugLogger: DebugLogger) {
  // do not log output if debug - it is huge, logged using debugLogger
  let rawList = await exec("prlctl", ["list", "-i", "-s", "name"], undefined, false)
  debugLogger.add("parallels.list", rawList)

  rawList = rawList.substring(rawList.indexOf("ID:"))

  // let match: Array<string> | null
  const result: Array<ParallelsVm> = []
  for (const info of rawList.split("\n\n").map(it => it.trim()).filter(it => it.length > 0)) {
    const vm: any = {}
    for (const line of info.split("\n")) {
      const meta = /^([^:("]+): (.*)$/.exec(line)
      if (meta == null) {
        continue
      }

      const key = meta[1].toLowerCase()
      if (key === "id" || key === "os" || key === "name" || key === "state" || key === "name") {
        vm[key] = meta[2].trim()
      }
    }
    result.push(vm)
  }
  return result
}

export async function getWindowsVm(debugLogger: DebugLogger): Promise<VmManager> {
  const vmList = (await parseVmList(debugLogger)).filter(it => it.os === "win-10")
  if (vmList.length === 0) {
    throw new Error("Cannot find suitable Parallels Desktop virtual machine (Windows 10 is required)")
  }

  // prefer running or suspended vm
  return new ParallelsVmManager(vmList.find(it => it.state === "running") || vmList.find(it => it.state === "suspended") || vmList[0])
}

export class VmManager {
  get pathSep(): string {
    return path.sep
  }

  exec(file: string, args: Array<string>, options?: ExecOptions, isLogOutIfDebug = true): Promise<string> {
    return exec(file, args, options, isLogOutIfDebug)
  }

  spawn(command: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    return spawn(command, args)
  }

  toVmFile(file: string): string {
    return file
  }
}

class ParallelsVmManager extends VmManager {
  private startPromise: Promise<any>

  private isExitHookAdded = false

  constructor(private readonly vm: ParallelsVm) {
    super()

    this.startPromise = this.doStartVm()
  }

  get pathSep(): string {
    return "/"
  }

  private handleExecuteError(error: Error): any {
    if (error.message.includes("Unable to open new session in this virtual machine")) {
      throw new Error(`Please ensure that your are logged in "${this.vm.name}" parallels virtual machine. In the future please do not stop VM, but suspend.\n\n${error.message}`)
    }
    throw error
  }

  async exec(file: string, args: Array<string>, options?: ExecOptions): Promise<string> {
    await this.ensureThatVmStarted()
    // it is important to use "--current-user" to execute command under logged in user - to access certs.
    return await exec("prlctl", ["exec", this.vm.id, "--current-user", file.startsWith("/") ? macPathToParallelsWindows(file) : file].concat(args), options)
      .catch(error => this.handleExecuteError(error))
  }

  async spawn(command: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    await this.ensureThatVmStarted()
    return await spawn("prlctl", ["exec", this.vm.id, command].concat(args), options, extraOptions)
      .catch(error => this.handleExecuteError(error))
  }

  private async doStartVm() {
    const vmId = this.vm.id
    const state = this.vm.state
    if (state === "running") {
      return
    }

    if (!this.isExitHookAdded) {
      this.isExitHookAdded = true
      require("async-exit-hook")((callback: (() => void) | null) => {
        const stopArgs = ["suspend", vmId]
        if (callback == null) {
          execFileSync("prlctl", stopArgs)
        }
        else {
          exec("prlctl", stopArgs)
            .then(callback)
            .catch(callback)
        }
      })
    }
    await exec("prlctl", ["start", vmId])
  }

  private ensureThatVmStarted() {
    let startPromise = this.startPromise
    if (startPromise == null) {
      startPromise = this.doStartVm()
      this.startPromise = startPromise
    }
    return startPromise
  }

  toVmFile(file: string): string {
    // https://stackoverflow.com/questions/4742992/cannot-access-network-drive-in-powershell-running-as-administrator
    return macPathToParallelsWindows(file)
  }
}

export function macPathToParallelsWindows(file: string) {
  if (file.startsWith("C:\\")) {
    return file
  }
  return "\\\\Mac\\Host\\" + file.replace(/\//g, "\\")
}

export interface ParallelsVm {
  id: string
  name: string
  os: "win-10" | "ubuntu" | "elementary"
  state: "running" | "suspended" | "stopped"
}