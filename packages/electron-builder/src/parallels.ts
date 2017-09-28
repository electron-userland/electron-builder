import { exec, spawn, ExecOptions, DebugLogger, ExtraSpawnOptions } from "builder-util"
import { SpawnOptions, execFileSync } from "child_process"

export async function parseVmList(debugLogger: DebugLogger) {
  // do not log output if debug - it is huge, logged using debugLogger
  let rawList = await exec("prlctl", ["list", "-i", "-s", "name"], {
    maxBuffer: 4 * 1024 * 1024,
  }, false)
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
      if (key === "id" || key === "os" || key === "name") {
        vm[key] = meta[2].trim()
      }
    }
    result.push(vm)
  }
  return result
}

export class VmManager {
  exec(file: string, args: Array<string>, options?: ExecOptions): Promise<string> {
    return exec(file, args, options)
  }

  spawn(command: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    return spawn(command, args)
  }

  toVmFile(file: string): string {
    return file
  }
}

export class ParallelsVmManager extends VmManager {
  private startPromise: Promise<any> | null

  private isExitHookAdded = false

  constructor(private readonly vm: ParallelsVm) {
    super()
  }

  async exec(file: string, args: Array<string>, options?: ExecOptions): Promise<string> {
    await this.ensureThatVmStarted()
    return await exec("prlctl", ["exec", this.vm.id, file.startsWith("/") ? macPathToParallelsWindows(file) : file].concat(args), options)
  }

  async spawn(command: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    await this.ensureThatVmStarted()
    return await spawn("prlctl", ["exec", this.vm.id, command].concat(args), options, extraOptions)
  }

  private async doStartVm() {
    const vmId = this.vm.id
    const status = await exec("prlctl", ["status", vmId])
    if (status.includes("running")) {
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
  return "\\\\Mac\\Host\\\\" + file
}

export interface ParallelsVm {
  id: string
  os: "win-10" | "ubuntu" | "elementary"
}