import BluebirdPromise from "bluebird-lst"
import { safeStringifyJson } from "builder-util-runtime"
import chalk from "chalk"
import { ChildProcess, execFile, spawn as _spawn, SpawnOptions, ExecFileOptions } from "child_process"
import { createHash } from "crypto"
import _debug from "debug"
import { homedir, tmpdir } from "os"
import * as path from "path"
import "source-map-support/register"
import { safeDump } from "js-yaml"

export { safeStringifyJson } from "builder-util-runtime"
export { TmpDir } from "temp-file"
export { log, warn, task } from "./log"
export { isMacOsSierra, isCanSignDmg } from "./macosVersion"
export { execWine, prepareWindowsExecutableArgs } from "./wine"
export { Arch, toLinuxArchString, getArchSuffix, ArchType, archFromString } from "./arch"
export { AsyncTaskManager } from "./asyncTaskManager"
export { DebugLogger } from "./DebugLogger"

export { hashFile } from "./hash"
export { copyFile } from "./fs"
export { asArray } from "builder-util-runtime"

export const debug = _debug("electron-builder")
export const debug7z = _debug("electron-builder:7z")

export function serializeToYaml(object: object) {
  return safeDump(object, {lineWidth: 8000})
}

export function removePassword(input: string) {
  return input.replace(/(-String |-P |pass:| \/p |-pass )([^ ]+)/g, (match, p1, p2) => {
    if (p1.trim() === "/p" && p2.startsWith("\\\\Mac\\Host\\\\")) {
      // appx /p
      return `${p1}${p2}`
    }
    return `${p1}${createHash("sha256").update(p2).digest("hex")} (sha256 hash)`
  })
}

function getProcessEnv(env: { [key: string]: string | undefined } | undefined | null) {
  if (process.platform === "win32") {
    return env
  }

  const finalEnv = {
    ...(env || process.env)
  }

  // without LC_CTYPE dpkg can returns encoded unicode symbols
  // set LC_CTYPE to avoid crash https://github.com/electron-userland/electron-builder/issues/503 Even "en_DE.UTF-8" leads to error.
  finalEnv.LANG = "en_US.UTF-8"
  finalEnv.LC_CTYPE = "en_US.UTF-8"
  finalEnv.LC_ALL = "en_US.UTF-8"
  return finalEnv
}

export function exec(file: string, args?: Array<string> | null, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
  if (debug.enabled) {
    debug(`Executing ${file} ${args == null ? "" : removePassword(args.join(" "))}`)
    if (options != null && options.env != null) {
      const diffEnv = {...options.env}
      for (const name of Object.keys(process.env)) {
        if (process.env[name] === options.env[name]) {
          delete diffEnv[name]
        }
      }
      debug(`env: ${safeStringifyJson(diffEnv)}`)
    }
    if (options != null && options.cwd != null) {
      debug(`cwd: ${options.cwd}`)
    }
  }

  return new BluebirdPromise<string>((resolve, reject) => {
    execFile(file, args as any, {
    ...options,
    maxBuffer: 10 * 1024 * 1024,
    env: getProcessEnv(options == null ? null : options.env),
  }, (error, stdout, stderr) => {
      if (error == null) {
        if (isLogOutIfDebug && debug.enabled) {
          if (stderr.length !== 0) {
            debug(file.endsWith("wine") ? removeWineSpam(stderr.toString()) : stderr)
          }
          if (stdout.length !== 0) {
            debug(stdout)
          }
        }
        resolve(stdout.toString())
      }
      else {
        let message = chalk.red(removePassword(`Exit code: ${(error as any).code}. ${error.message}`))
        if (stdout.length !== 0) {
          if (file.endsWith("wine")) {
            stdout = removeWineSpam(stdout.toString())
          }
          message += `\n${chalk.yellow(stdout.toString())}`
        }
        if (stderr.length !== 0) {
          if (file.endsWith("wine")) {
            stderr = removeWineSpam(stderr.toString())
          }
          message += `\n${chalk.red(stderr.toString())}`
        }

        reject(new Error(message))
      }
    })
  })
}

function removeWineSpam(out: string) {
  return out.toString()
    .split("\n")
    .filter(it => !it.includes("wine: cannot find L\"C:\\\\windows\\\\system32\\\\winemenubuilder.exe\"") && !it.includes("err:wineboot:ProcessRunKeys Error running cmd L\"C:\\\\windows\\\\system32\\\\winemenubuilder.exe"))
    .join("\n")

}

export interface ExtraSpawnOptions {
  isDebugEnabled?: boolean
  isPipeInput?: boolean
}

export function doSpawn(command: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): ChildProcess {
  if (options == null) {
    options = {}
  }

  options.env = getProcessEnv(options.env)

  const isDebugEnabled = extraOptions == null || extraOptions.isDebugEnabled == null ? debug.enabled : extraOptions.isDebugEnabled
  if (options.stdio == null) {
    // do not ignore stdout/stderr if not debug, because in this case we will read into buffer and print on error
    options.stdio = [extraOptions != null && extraOptions.isPipeInput ? "pipe" : "ignore", isDebugEnabled ? "inherit" : "pipe", isDebugEnabled ? "inherit" : "pipe"]
  }

  // use general debug.enabled to log spawn, because it doesn't produce a lot of output (the only line), but important in any case
  if (debug.enabled) {
    const argsString = args.join(" ")
    debug(`Spawning ${command} ${command === "docker" ? argsString : removePassword(argsString)}`)
    if (options != null && options.cwd != null) {
      debug(`cwd: ${options.cwd}`)
    }
  }

  try {
    return _spawn(command, args, options)
  }
  catch (e) {
    throw new Error(`Cannot spawn ${command}: ${e.stack || e}`)
  }
}

export function spawnAndWrite(command: string, args: Array<string>, data: string, options?: SpawnOptions, isDebugEnabled: boolean = false) {
  const childProcess = doSpawn(command, args, options, {isPipeInput: true, isDebugEnabled})
  const timeout = setTimeout(() => childProcess.kill(), 4 * 60 * 1000)
  return new BluebirdPromise<any>((resolve, reject) => {
    handleProcess("close", childProcess, command, () => {
      try {
        clearTimeout(timeout)
      }
      finally {
        resolve()
      }
    }, error => {
      try {
        clearTimeout(timeout)
      }
      finally {
        reject(error.stack || error.toString())
      }
    })

    childProcess.stdin.end(data)
  })
}

export function spawn(command: string, args?: Array<string> | null, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
  return new BluebirdPromise<any>((resolve, reject) => {
    handleProcess("close", doSpawn(command, args || [], options, extraOptions), command, resolve, reject)
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
      debug(`${path.basename(command)} (${childProcess.pid}) exited with exit code 0`)
    }

    if (code === 0) {
      if (resolve != null) {
        resolve()
      }
    }
    else {
      function formatOut(text: string, title: string) {
        return text.length === 0 ? "" : `\n${title}:\n${text}`
      }

      reject(new Error(`${command} exited with code ${code}${formatOut(out, "Output")}${formatOut(errorOut, "Error output")}`))
    }
  })
}

export function use<T, R>(value: T | null, task: (it: T) => R): R | null {
  return value == null ? null : task(value)
}

export function debug7zArgs(command: "a" | "x"): Array<string> {
  const args = [command, "-bd"]
  if (debug7z.enabled) {
    args.push("-bb")
  }
  return args
}

export function isEmptyOrSpaces(s: string | null | undefined): s is "" | null | undefined {
  return s == null || s.trim().length === 0
}

export function isTokenCharValid(token: string) {
  return /^[\w\/=+-]+$/.test(token)
}

export function getCacheDirectory(): string {
  const env = process.env.ELECTRON_BUILDER_CACHE
  if (!isEmptyOrSpaces(env)) {
    return env!
  }

  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Caches", "electron-builder")
  }

  const localappdata = process.env.LOCALAPPDATA
  if (process.platform === "win32" && localappdata != null) {
    // https://github.com/electron-userland/electron-builder/issues/1164
    if (localappdata.toLowerCase().includes("\\windows\\system32\\") || (process.env.USERNAME || "").toLowerCase() === "system") {
      return path.join(tmpdir(), "electron-builder-cache")
    }
    return path.join(localappdata, "electron-builder", "cache")
  }

  return path.join(homedir(), ".cache", "electron-builder")
}

// fpm bug - rpm build --description is not escaped, well... decided to replace quite to smart quote
// http://leancrew.com/all-this/2010/11/smart-quotes-in-javascript/
export function smarten(s: string): string {
  // opening singles
  s = s.replace(/(^|[-\u2014\s(\["])'/g, "$1\u2018")
  // closing singles & apostrophes
  s = s.replace(/'/g, "\u2019")
  // opening doubles
  s = s.replace(/(^|[-\u2014/\[(\u2018\s])"/g, "$1\u201c")
  // closing doubles
  s = s.replace(/"/g, "\u201d")
  return s
}

export function addValue<K, T>(map: Map<K, Array<T>>, key: K, value: T) {
  const list = map.get(key)
  if (list == null) {
    map.set(key, [value])
  }
  else if (!list.includes(value)) {
    list.push(value)
  }
}

export function replaceDefault(inList: Array<string> | null | undefined, defaultList: Array<string>): Array<string> {
  if (inList == null) {
    return defaultList
  }

  const index = inList.indexOf("default")
  if (index >= 0) {
    const list = inList.slice(0, index)
    list.push(...defaultList)
    if (index !== (inList.length - 1)) {
      list.push(...inList.slice(index + 1))
    }
    inList = list
  }
  return inList
}

export function getPlatformIconFileName(value: string | null | undefined, isMac: boolean) {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }

  if (!value.includes(".")) {
    return `${value}.${isMac ? "icns" : "ico"}`
  }

  return value.replace(isMac ? ".ico" : ".icns", isMac ? ".icns" : ".ico")
}

export function isPullRequest() {
  // TRAVIS_PULL_REQUEST is set to the pull request number if the current job is a pull request build, or false if it’s not.
  function isSet(value: string | undefined) {
    // value can be or null, or empty string
    return value && value !== "false"
  }

  return isSet(process.env.TRAVIS_PULL_REQUEST) || isSet(process.env.CI_PULL_REQUEST) || isSet(process.env.CI_PULL_REQUESTS) || isSet(process.env.BITRISE_PULL_REQUEST) || isSet(process.env.APPVEYOR_PULL_REQUEST_NUMBER)
}

export function isEnvTrue(value: string | null | undefined) {
  if (value != null) {
    value = value.trim()
  }
  return value === "true" || value === "" || value === "1"
}