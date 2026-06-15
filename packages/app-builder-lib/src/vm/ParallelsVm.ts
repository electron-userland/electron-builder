import { DebugLogger, ExtraSpawnOptions, exec, log, sanitizeDirPath, spawn } from "builder-util"
import { ExecFileOptions, SpawnOptions, execFileSync } from "child_process"
import { VmManager } from "./vm.js"

/** @internal */
export async function parseVmList(debugLogger: DebugLogger) {
  // do not log output if debug - it is huge, logged using debugLogger
  let rawList = await exec("prlctl", ["list", "-i", "-s", "name"], undefined, false)
  debugLogger.add("parallels.list", rawList)

  rawList = rawList.substring(rawList.indexOf("ID:"))

  // let match: Array<string> | null
  const result: Array<ParallelsVm> = []
  for (const info of rawList
    .split("\n\n")
    .map(it => it.trim())
    .filter(it => it.length > 0)) {
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

export class ParallelsVmManager extends VmManager {
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

    log.warn("ensure that 'Share folders' is set to 'All Disks', see https://goo.gl/E6XphP")
    throw error
  }

  async exec(file: string, args: Array<string>, options?: ExecFileOptions): Promise<string> {
    await this.ensureThatVmStarted()
    // it is important to use "--current-user" to execute command under logged in user - to access certs.
    return await exec("prlctl", ["exec", this.vm.id, "--current-user", file.startsWith("/") ? macPathToParallelsWindows(file) : file].concat(args), options).catch(error =>
      this.handleExecuteError(error)
    )
  }

  async spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    await this.ensureThatVmStarted()
    return await spawn("prlctl", ["exec", this.vm.id, file].concat(args), options, extraOptions).catch(error => this.handleExecuteError(error))
  }

  private async doStartVm() {
    const vmId = this.vm.id
    const state = this.vm.state
    if (state === "running") {
      return
    }

    if (!this.isExitHookAdded) {
      this.isExitHookAdded = true
      const stopArgs = ["suspend", vmId]
      // Suspend the VM on normal exit and on termination signals.
      // SIGTERM/SIGINT use async exec(); the synchronous 'exit' fallback fires
      // after all async callbacks have already resolved, so execFileSync is safe.
      const suspendAsync = () => exec("prlctl", stopArgs).catch(() => {})
      const suspendSync = () => {
        try {
          execFileSync("prlctl", stopArgs)
        } catch {
          /* best-effort */
        }
      }
      process.once("SIGTERM", () => {
        void suspendAsync()
      })
      process.once("SIGINT", () => {
        void suspendAsync()
      })
      process.once("exit", suspendSync)
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
  // file is an absolute macOS host path; sanitizeDirPath rejects null/newline (arg-injection) and leaves it otherwise unchanged
  const hostPath = sanitizeDirPath(file).replace(/\//g, "\\")
  const uncPath = "\\\\Mac\\Host\\" + hostPath
  // Reject characters/control bytes that can change command/tool argument semantics.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F"*?<>|]/.test(uncPath)) {
    throw new Error(`Invalid path for Parallels VM execution: "${file}"`)
  }
  return uncPath
}

export interface ParallelsVm {
  id: string
  name: string
  os: "win-10" | "win-11" | "ubuntu" | "elementary"
  state: "running" | "suspended" | "stopped"
}
