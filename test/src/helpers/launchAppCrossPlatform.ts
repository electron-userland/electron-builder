import { spawn, ChildProcess } from "child_process"
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
  waitForVersionLog?: boolean
  updateConfigPath: string
}

export async function launchAndWaitForQuit({
  appPath,
  timeoutMs = 20000,
  env = {},
  expectedVersion,
  updateConfigPath,
  waitForVersionLog = true,
}: LaunchOptions): Promise<LaunchResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess

    const platform = os.platform()
    const versionRegex = /APP_VERSION:\s*([0-9]+\.[0-9]+\.[0-9]+)/
    const finalEnv = {
      ...process.env,
      AUTO_UPDATER_TEST: "1",
      AUTO_UPDATER_TEST_CONFIG_PATH: updateConfigPath,
      ...env,
    }

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []

    function spawnApp(command: string, args: string[] = []) {
      return spawn(command, args, {
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: finalEnv,
      })
    }

    try {
      switch (platform) {
        case "darwin": {
          const binary = path.join(appPath, "Contents", "MacOS", path.basename(appPath, ".app"))
          child = spawnApp(binary)
          break
        }
        case "win32": {
          const powershellCmd = `Start-Process -FilePath '${appPath}' -Wait`
          child = spawn("powershell.exe", ["-NoProfile", "-Command", powershellCmd], {
            stdio: ["ignore", "pipe", "pipe"],
            env: finalEnv,
          })
          break
        }
        case "linux": {
          child = spawnApp(appPath)
          break
        }
        default:
          throw new Error(`Unsupported platform: ${platform}`)
      }
    } catch (err) {
      return reject(err)
    }

    let version: string | undefined
    let resolved = false

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
          resolveResult(resolve, version, 0, stdoutChunks, stderrChunks)
        }
        child.kill() // best-effort cleanup
      }
    })

    child.stderr?.on("data", data => {
      stderrChunks.push(data.toString())
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
        resolveResult(resolve, version, code, stdoutChunks, stderrChunks)
      }
    })

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        reject(new Error(`Timeout after ${timeoutMs}ms\nSTDOUT:\n${stdoutChunks.join("")}\nSTDERR:\n${stderrChunks.join("")}`))
      }
      child.kill() // best-effort cleanup
    }, timeoutMs)
  })

  function resolveResult(
    resolve: (value: LaunchResult | PromiseLike<LaunchResult>) => void,
    version: string | undefined,
    code: number | null,
    stdoutChunks: string[],
    stderrChunks: string[]
  ) {
    resolve({
      version,
      exitCode: code,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    })
  }
}
