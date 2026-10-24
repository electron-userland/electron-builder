import { DebugLogger, Executables, ExtraSpawnOptions, exec, log, sanitizeDirPath, spawn, stripSensitiveEnvVars } from "builder-util"
import { ExecFileOptions, SpawnOptions, execFileSync } from "child_process"
import { homedir } from "os"
import { VmManager } from "./vm.js"

/** The same executables inside a Parallels Windows guest, at the locations of a default Windows installation. */
export const PARALLELS_GUEST_WINDOWS_POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
export const PARALLELS_GUEST_PWSH = "C:\\Program Files\\PowerShell\\7\\pwsh.exe"

/** @internal */
export async function parseVmList(debugLogger: DebugLogger) {
  // prlctl by absolute path; when Parallels Desktop is not installed this throws, which callers treat as "no Parallels VM"
  const prlctl = Executables.resolve("prlctl")
  // do not log output if debug - it is huge, logged using debugLogger
  let rawList = await exec(prlctl, ["list", "-i", "-s", "name"], undefined, false)
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

  private readonly prlctl: string

  constructor(private readonly vm: ParallelsVm) {
    super()
    this.prlctl = Executables.resolve("prlctl")

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
    // Merge caller-supplied env onto the base environment, so extra vars don't strip the variables `prlctl` relies on (HOME, etc.).
    const mergedOptions = options?.env != null ? { ...options, env: { ...stripSensitiveEnvVars(process.env), ...options.env } } : options
    // it is important to use "--current-user" to execute command under logged in user - to access certs.
    return await exec(this.prlctl, ["exec", this.vm.id, "--current-user", file.startsWith("/") ? macPathToParallelsWindows(file) : file].concat(args), mergedOptions).catch(error =>
      this.handleExecuteError(error)
    )
  }

  async spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    await this.ensureThatVmStarted()
    return await spawn(this.prlctl, ["exec", this.vm.id, file].concat(args), options, extraOptions).catch(error => this.handleExecuteError(error))
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
      const suspendAsync = () => exec(this.prlctl, stopArgs).catch(() => {})
      const suspendSync = () => {
        try {
          execFileSync(this.prlctl, stopArgs)
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
    await exec(this.prlctl, ["start", vmId])
  }

  private ensureThatVmStarted() {
    let startPromise = this.startPromise
    if (startPromise == null) {
      startPromise = this.doStartVm()
      this.startPromise = startPromise
    }
    return startPromise
  }

  // The guest's environment is not visible from the host, so the location of a default Windows installation is used. PowerShell 7
  // is not: `prlctl exec` passes its arguments to the guest without quoting, so a path containing a space cannot be started.
  protected windowsPowerShellPaths() {
    return {
      powershell: PARALLELS_GUEST_WINDOWS_POWERSHELL,
      pwsh: { unavailable: `PowerShell 7 (${PARALLELS_GUEST_PWSH}) is not used in a Parallels VM, because prlctl exec cannot start a path that contains a space` },
    }
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
  if (!file.startsWith("/")) {
    throw new Error(`Invalid path for Parallels VM execution: "${file}"`)
  }
  // Validate the raw host path up-front and reject control bytes plus shell/UNC-significant
  // metacharacters BEFORE it is concatenated into the \\Mac\... path passed to `prlctl exec`. The
  // `/`→`\` conversion below only adds backslashes (not in the deny-set), so validating the input here
  // is the single sanitizing barrier for the value that reaches the command.
  // (CodeQL js/shell-command-constructed-from-input — sanitize the tainted input at the source.)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F"*?<>|]/.test(file)) {
    throw new Error(`Invalid path for Parallels VM execution: "${file}"`)
  }
  // sanitizeDirPath additionally rejects null/newline and resolves the path; the input is already
  // validated above, so the resulting UNC path is safe to hand to prlctl.
  const sanitized = sanitizeDirPath(file)
  // \\Mac\Home maps to the current user's home directory and is always accessible
  // in both --current-user and SYSTEM exec contexts (unlike \\Mac\Host which requires
  // "All Disks" sharing to be enabled in Parallels preferences).
  const home = homedir()
  // codeql[js/shell-command-constructed-from-input] - `file` is validated above (control bytes + shell/UNC metacharacters rejected) and resolved via sanitizeDirPath; the resulting UNC path is passed to prlctl as a discrete execFile argv element (array args, no shell), so no shell interpretation occurs
  const uncPath = sanitized.startsWith(home + "/")
    ? "\\\\Mac\\Home\\" + sanitized.substring(home.length + 1).replace(/\//g, "\\")
    : "\\\\Mac\\Host\\" + sanitized.replace(/\//g, "\\")
  return uncPath
}

export interface ParallelsVm {
  id: string
  name: string
  os: "win-10" | "win-11" | "ubuntu" | "elementary"
  state: "running" | "suspended" | "stopped"
}
