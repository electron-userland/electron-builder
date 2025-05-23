import { ChildProcess, execSync, spawn } from "child_process"
import { chmodSync, closeSync, openSync, readSync } from "fs"
import os from "os"
import path from "path"

interface LaunchResult {
  version?: string
  exitCode: number | null
  stdout: string
  stderr: string
}

interface LaunchOptions {
  appPath: string
  timeoutMs?: number
  env?: Record<string, string>
  expectedVersion?: string
  updateConfigPath: string
}

export async function launchAndWaitForQuit({ appPath, timeoutMs = 20000, env = {}, expectedVersion, updateConfigPath }: LaunchOptions): Promise<LaunchResult> {
  let child: ChildProcess
  const versionRegex = /APP_VERSION:\s*([0-9]+\.[0-9]+\.[0-9]+)/

  function spawnApp(command: string, args: string[] = [], detached = true, localEnv = env) {
    return spawn(command, args, {
      detached,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AUTO_UPDATER_TEST: "1",
        AUTO_UPDATER_TEST_CONFIG_PATH: updateConfigPath,
        ...localEnv,
      },
    })
  }

  const platform = os.platform()
  switch (platform) {
    case "darwin": {
      const binary = path.join(appPath, "Contents", "MacOS", path.basename(appPath, ".app"))
      child = spawnApp(binary)
      break
    }

    case "win32": {
      child = spawnApp(appPath)
      break
    }

    case "linux": {
      const { display, stop } = startXvfb()
      await new Promise(resolve => setTimeout(resolve, 500)) // Give Xvfb time to init

      if (appPath.endsWith(".AppImage")) {
        const magic = readMagicBytes(appPath)
        if (magic.toString("utf-8", 1, 4) !== "ELF") {
          throw new Error(`AppImage is not a valid ELF binary: magic=${magic.toString("hex")}`)
        }
        execSync("file " + appPath, { stdio: "inherit" })

        chmodSync(appPath, 0o755)
        const spawnEnv = {
          ...env,
          DISPLAY: display,
          APPIMAGE_EXTRACT_AND_RUN: "1",
        }

        child = spawn(appPath, ["--no-sandbox"], {
          detached: true,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            AUTO_UPDATER_TEST: "1",
            AUTO_UPDATER_TEST_CONFIG_PATH: updateConfigPath,
            ...spawnEnv,
          },
        })
      } else {
        child = spawnApp(appPath, [], true, { DISPLAY: display })
      }
      break
    }

    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }

  return new Promise((resolve, reject) => {
    let version: string | undefined
    let resolved = false
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []

    function resolveResult(code: number | null) {
      resolve({
        version,
        exitCode: code,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      })
    }

    child.stdout?.on("data", data => {
      const line = data.toString()
      console.log(line)
      stdoutChunks.push(line)
      const match = line.match(versionRegex)
      if (match) {
        version = match[1].trim()
        console.log(`Found Version in console logs: ${version}`)
        if (expectedVersion && version !== expectedVersion) {
          reject(new Error(`Expected version ${expectedVersion}, got ${version}`))
        } else {
          resolved = true
          resolveResult(0)
          // try {
          //   child.kill()
          // } catch {
          //   /* empty */
          // }
        }
      }
    })

    child.stderr?.on("data", data => {
      const line = data.toString()
      stderrChunks.push(line)
      console.error(`[stderr] ${line}`)
    })

    child.on("error", err => {
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    child.on("exit", code => {
      if (!resolved) {
        resolved = true
        resolveResult(code)
      }
    })

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        child.kill()
        reject(new Error(`Timeout after ${timeoutMs}ms\nSTDOUT:\n${stdoutChunks.join("")}\nSTDERR:\n${stderrChunks.join("")}`))
      }
    }, timeoutMs)
  })
}

// ⬇️ Launch Xvfb and validate it starts
export function startXvfb(): { display: string; stop: () => void } {
  const display = `:${Math.floor(90 + Math.random() * 10)}`
  const proc = spawn("Xvfb", [display, "-screen", "0", "1024x768x24"], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  let errorOutput = ""
  proc.stderr?.on("data", data => {
    errorOutput += data.toString()
  })

  setTimeout(() => {
    if (!proc.pid || isNaN(proc.pid)) {
      throw new Error(`Xvfb failed to start on ${display}: ${errorOutput}`)
    }
  }, 200)

  proc.unref()

  const stop = () => {
    if (typeof proc.pid === "number" && !isNaN(proc.pid)) {
      try {
        process.kill(-proc.pid, "SIGTERM")
      } catch (e) {
        console.warn("Failed to stop Xvfb:", e)
      }
    }
  }

  console.log("Xvfb started on display", display)
  ;["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"].forEach(sig => {
    process.once(sig, () => {
      try {
        stop()
      } catch (e) {
        console.warn("Failed to stop Xvfb:", e)
      }
    })
  })

  return {
    display,
    stop,
  }
}

// ⬇️ Read first 4 bytes of AppImage to validate ELF header
function readMagicBytes(appPath: string): Buffer {
  const fd = openSync(appPath, "r")
  const buffer = Buffer.alloc(4)
  readSync(fd, buffer, 0, 4, 0)
  closeSync(fd)
  return buffer
}
