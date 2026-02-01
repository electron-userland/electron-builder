import { getBinFromUrl } from "app-builder-lib/src/binDownload"
import { isEmptyOrSpaces } from "builder-util"
import { ChildProcess, spawn } from "child_process"
import { chmodSync } from "fs"
import os from "os"
import path from "path"

export async function getRanLocalServerPath() {
  /**
   * Folder structure inside the tools zip is:
   * ran-v0.1.6-all-platforms/
   *    ├── VERSION.txt
   *    ├── darwin
   *    │ └── amd64
   *    │     └── ran
   *    ├── linux
   *    │ ├── 386
   *    │ │ └── ran
   *    │ ├── amd64
   *    │ │ └── ran
   *    │ └── arm64
   *    │     └── ran
   *    └── win
   *        ├── amd64
   *        │ └── ran.exe
   *        └── ia32
   *          └── ran.exe
   */
  const serverBin = await getBinFromUrl("ran@1.0.0", "ran-v0.1.6-all-platforms.zip", "8OW8qc8CHG4dT0/R/ccNSO7AJAOgSRxJwxHF6vaiYoyh3eVp7rHdkYBkqnXx54Eqdo4WY8RUxEwKzKaAu1ISFA==")
  const arch = process.arch === "x64" || process.platform === "darwin" ? "amd64" : process.arch === "ia32" && process.platform === "linux" ? "386" : process.arch
  if (process.platform === "win32") {
    return path.join(serverBin, "win", process.arch === "ia32" ? "ia32" :"amd64", "ran.exe")
  }
  return path.join(serverBin, process.platform, arch, "ran")
}

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
  packageManagerToTest: string
}

export async function launchAndWaitForQuit({
  appPath,
  timeoutMs = 20000,
  env = {},
  expectedVersion,
  updateConfigPath,
  packageManagerToTest,
}: LaunchOptions): Promise<LaunchResult> {
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
        ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER: packageManagerToTest,
        ...localEnv,
      },
    })
  }

  const platform = os.platform()
  switch (platform) {
    case "darwin": {
      child = spawnApp(appPath)
      break
    }

    case "win32": {
      child = spawnApp(appPath)
      break
    }

    case "linux": {
      const { display } = startXvfb()
      await new Promise(resolve => setTimeout(resolve, 500)) // Give Xvfb time to init

      if (appPath.endsWith(".AppImage")) {
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
        child = spawnApp(appPath, ["--no-sandbox"], true, { DISPLAY: display })
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
  const display = `:${Math.ceil(Math.random() * 100)}`
  const proc = spawn("Xvfb", [display, "-screen", "0", "1920x1080x24"], {
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
  }, 1000)

  proc.unref()

  const stop = () => {
    console.log(`Stopping Xvfb.${isEmptyOrSpaces(errorOutput) ? "" : ` Error output: ${errorOutput}`}`)
    if (typeof proc.pid === "number" && !isNaN(proc.pid)) {
      try {
        process.kill(-proc.pid, "SIGTERM")
      } catch (e) {
        console.warn("Failed to stop Xvfb:", e)
      }
    }
  }
  // Ensure Xvfb is stopped on main process exit
  ;["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"].forEach(sig => {
    process.once(sig, () => {
      try {
        stop()
      } catch (e) {
        console.warn("Failed to stop Xvfb:", e)
      }
    })
  })

  console.log("Xvfb started on display", display)
  return {
    display,
    stop,
  }
}
