import { isEmptyOrSpaces } from "builder-util"
import type { VmManager } from "app-builder-lib/out/vm/vm"
import { ChildProcess, spawn } from "child_process"
import * as fs from "fs"
import * as http from "http"
import * as net from "net"
import os from "os"
import path from "path"

/**
 * Returns the macOS host's IP address on the Parallels virtual network.
 * The VM reaches the host via this address (not 127.0.0.1).
 */
/**
 * Converts a macOS path under the user home directory to its Parallels UNC form.
 * Files in `~/` are reachable via `\\Mac\Home\...` (always shared) without needing
 * "All Disks" sharing. Paths outside the home dir fall back to `\\Mac\Host\...`.
 */
export function toVmHomePath(macPath: string): string {
  const home = os.homedir()
  const rel = path.relative(home, macPath)
  if (!rel.startsWith("..")) {
    return "\\\\Mac\\Home\\" + rel.replace(/\//g, "\\")
  }
  return "\\\\Mac\\Host\\" + macPath.replace(/\//g, "\\")
}

export function getParallelsHostIP(): string | undefined {
  const interfaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(interfaces)) {
    // Older Parallels uses prl* interfaces; newer versions use bridge* (e.g. bridge100)
    if (name.startsWith("prl") || name.startsWith("bridge")) {
      const addr = addrs?.find(a => a.family === "IPv4" && !a.internal)
      if (addr) return addr.address
    }
  }
  return undefined
}

export function createLocalServer(root: string, bindAddress = "127.0.0.1"): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url!, "http://localhost").pathname).replace(/^\/+/, "")
    const filePath = path.resolve(root, pathname)
    if (!filePath.startsWith(path.resolve(root) + path.sep) && filePath !== path.resolve(root)) {
      res.writeHead(403)
      res.end()
      return
    }
    fs.stat(filePath, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        res.writeHead(404)
        res.end("Not found")
        return
      }

      const size = stat.size
      res.setHeader("Accept-Ranges", "bytes")

      const rangeHeader = req.headers["range"]
      if (!rangeHeader) {
        res.writeHead(200, { "Content-Length": size, "Content-Type": "application/octet-stream" })
        fs.createReadStream(filePath).pipe(res)
        return
      }

      const ranges = parseByteRanges(rangeHeader, size)
      if (!ranges || ranges.length === 0) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` })
        res.end()
        return
      }

      if (ranges.length === 1) {
        const [start, end] = ranges[0]
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": end - start + 1,
          "Content-Type": "application/octet-stream",
        })
        fs.createReadStream(filePath, { start, end }).pipe(res)
        return
      }

      // Multi-range: DataSplitter expects the very first boundary without a leading \r\n
      const boundary = "gc0p4Jq0M2Yt08jU534c0p"
      res.writeHead(206, { "Content-Type": `multipart/byteranges; boundary=${boundary}` })

      let i = 0
      const writeNext = () => {
        if (i >= ranges.length) {
          res.end(`\r\n--${boundary}--\r\n`)
          return
        }
        const [start, end] = ranges[i]
        i++
        const prefix = i === 1 ? "" : "\r\n"
        res.write(`${prefix}--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${size}\r\n\r\n`)
        const stream = fs.createReadStream(filePath, { start, end })
        stream.once("error", () => {
          stream.destroy()
          res.destroy()
        })
        stream.once("end", writeNext)
        stream.pipe(res, { end: false })
      }
      writeNext()
    })
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, bindAddress, () => {
      const { port } = server.address() as net.AddressInfo
      resolve({ server, port })
    })
  })
}

function parseByteRanges(header: string, size: number): Array<[number, number]> | null {
  const m = header.match(/^bytes=(.+)$/)
  if (!m) return null
  const ranges: Array<[number, number]> = []
  for (const r of m[1].split(",")) {
    const [s, e] = r.trim().split("-")
    const start = s === "" ? size - parseInt(e, 10) : parseInt(s, 10)
    const end = e === "" ? size - 1 : Math.min(parseInt(e, 10), size - 1)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) return null
    ranges.push([start, end])
  }
  return ranges.length > 0 ? ranges : null
}

interface LaunchResult {
  version?: string
  exitCode: number | null
  stdout: string
  stderr: string
}

interface LaunchOptions {
  appPath: string
  vm?: VmManager
  timeoutMs?: number
  env?: Record<string, string>
  expectedVersion?: string
  updateConfigPath: string
  packageManagerToTest: string
  waitForExit?: boolean
}

export async function launchAndWaitForQuit({
  appPath,
  vm,
  timeoutMs = 20000,
  env = {},
  expectedVersion,
  updateConfigPath,
  packageManagerToTest,
  waitForExit = false,
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

  // VM-based execution: prlctl exec runs synchronously (blocks until the process exits),
  // so we build a PowerShell command that sets env vars and runs the app, then parse stdout.
  if (vm) {
    const vmConfigPath = toVmHomePath(updateConfigPath)
    const envVars: Record<string, string> = {
      AUTO_UPDATER_TEST: "1",
      AUTO_UPDATER_TEST_CONFIG_PATH: vmConfigPath,
      ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER: packageManagerToTest,
      ...env,
    }
    const setters = Object.entries(envVars)
      .map(([k, v]) => `$env:${k}='${v.replace(/'/g, "''")}'`)
      .join("; ")
    // 2>&1 merges TestApp.exe's stderr into PowerShell's stdout stream so
    // console.error calls (including electron-updater errors) are captured.
    const psCommand = `${setters}; & '${appPath.replace(/'/g, "''")}' 2>&1`

    const output = await vm.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { timeout: timeoutMs })

    const match = output.match(versionRegex)
    const version = match?.[1]?.trim()
    if (expectedVersion && version && version !== expectedVersion) {
      throw new Error(`Expected version ${expectedVersion}, got ${version}`)
    }
    return { version, exitCode: 0, stdout: output, stderr: "" }
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
        fs.chmodSync(appPath, 0o755)
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
        child = spawnApp(appPath, ["--no-sandbox"], true, { ...env, DISPLAY: display })
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
          resolved = true
          child.kill()
          reject(new Error(`Expected version ${expectedVersion}, got ${version}`))
        } else if (!waitForExit) {
          // resolve immediately once the version is confirmed
          resolved = true
          resolveResult(0)
        }
        // else: wait for the process to exit so the caller knows the full
        // update+install cycle completed before it does anything further
      }
    })

    child.stderr?.on("data", data => {
      const line = data.toString()
      stderrChunks.push(line)
      console.error(`[stderr] ${line}`)
      // GPU/native crashes produce a FATAL ERROR in stderr that can hang the process
      // during cleanup. If we've already captured the version the probe succeeded —
      // kill and resolve rather than waiting for an exit that never comes.
      if (!resolved && version != null && line.includes("FATAL ERROR")) {
        resolved = true
        child.kill()
        resolveResult(0)
      }
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
