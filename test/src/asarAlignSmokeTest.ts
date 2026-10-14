import { Platform } from "app-builder-lib"
import { readAsarHeader } from "app-builder-lib/src/asar/asar"
import { execFile, execSync } from "child_process"
import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { promisify } from "util"
import { app, linuxDirTarget } from "./helpers/packTester.js"

// End-to-end check of `asar.contentAlignment` against a REAL Electron: the packaged app runs with the
// `enableEmbeddedAsarIntegrityValidation` + `onlyLoadAppFromAsar` fuses on, so Electron validates
// every file's block hashes (from the header's per-file `integrity`) on read. The app hashes every
// file it can see inside app.asar and `require`s a module from it. Two controls prove what the run
// proves: a flipped byte inside an alignment gap changes nothing (the gaps are outside every file),
// while a flipped byte inside a file's content is seen by the app (the bytes really are located
// through the rewritten offsets, not cached or read from elsewhere). electron-builder embeds the
// ASAR header hash only on Windows/macOS (`addWinAsarIntegrity` / Info.plist) and Electron's Linux
// build validates nothing without it, so *enforcement* of the fuse against an aligned asar can only
// be observed on those platforms — this Linux run proves readability, not enforcement.

const execFileAsync = promisify(execFile)
const ALIGNMENT = 512

function hasXvfb(): boolean {
  try {
    execSync("command -v xvfb-run", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const canRunElectron = process.platform === "linux" && (process.env.DISPLAY != null || hasXvfb())

interface SmokeResult {
  appPath: string
  moduleValue: string
  files: Record<string, string>
}

const SMOKE_MAIN = `
const { app } = require("electron")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
app
  .whenReady()
  .then(() => {
    const root = app.getAppPath()
    const files = {}
    const walk = (dir, rel) => {
      for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name)
        const r = rel ? rel + "/" + name : name
        if (fs.statSync(abs).isDirectory()) {
          walk(abs, r)
        } else {
          files[r] = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex")
        }
      }
    }
    walk(root, "")
    const moduleValue = require(path.join(root, "smoke-module.js")).value
    process.stdout.write("SMOKE_RESULT " + JSON.stringify({ appPath: root, moduleValue, files }) + "\\n")
    app.exit(0)
  })
  .catch(e => {
    process.stderr.write("SMOKE_ERROR " + String(e && e.stack) + "\\n")
    app.exit(3)
  })
`

// Filler sizes straddle the alignment so the layout has real padding gaps.
function fillerFiles(): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  let seed = 99
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0)
  for (let i = 0; i < 24; i++) {
    const size = 100 + (next() % 2500)
    const buf = Buffer.alloc(size)
    for (let j = 0; j < size; j++) {
      buf[j] = next() & 0xff
    }
    files.set(`filler/${i % 4}/f${i}.bin`, buf)
  }
  return files
}

async function findExecutable(appDir: string): Promise<string> {
  const candidates: Array<string> = []
  for (const name of await fs.readdir(appDir)) {
    if (name === "chrome-sandbox" || name === "chrome_crashpad_handler" || name.includes(".")) {
      continue
    }
    const stat = await fs.stat(path.join(appDir, name))
    if (stat.isFile() && (stat.mode & 0o111) !== 0) {
      candidates.push(name)
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`expected exactly one app executable in ${appDir}, found: ${candidates.join(", ")}`)
  }
  return path.join(appDir, candidates[0])
}

async function runElectron(exe: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const args = ["--no-sandbox", "--disable-gpu"]
  const [cmd, cmdArgs] = process.env.DISPLAY != null ? [exe, args] : ["xvfb-run", ["-a", "--server-args=-screen 0 1024x768x24", exe, ...args]]
  try {
    const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
      env: { ...process.env, ELECTRON_DISABLE_SANDBOX: "1", ELECTRON_ENABLE_LOGGING: "1" },
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    return { code: 0, stdout, stderr }
  } catch (e: any) {
    return { code: e.code ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" }
  }
}

function parseSmokeResult(stdout: string): SmokeResult | null {
  const line = stdout.split(/\r?\n/).find(l => l.startsWith("SMOKE_RESULT "))
  return line == null ? null : (JSON.parse(line.slice("SMOKE_RESULT ".length)) as SmokeResult)
}

interface PackedFile {
  rel: string
  offset: number
  size: number
}

async function packedFiles(asarFile: string): Promise<{ contentStart: number; files: Array<PackedFile>; headerJson: string }> {
  const { header, size } = await readAsarHeader(asarFile)
  const files: Array<PackedFile> = []
  const walk = (node: any, prefix: string) => {
    for (const [name, child] of Object.entries<any>(node.files ?? {})) {
      const rel = prefix ? `${prefix}/${name}` : name
      if (child.files != null) {
        walk(child, rel)
      } else if (child.offset != null && !child.unpacked && child.link == null) {
        files.push({ rel, offset: parseInt(child.offset, 10), size: child.size })
      }
    }
  }
  walk(JSON.parse(header), "")
  files.sort((a, b) => a.offset - b.offset)
  return { contentStart: 8 + size, files, headerJson: header }
}

async function flipByte(file: string, position: number): Promise<void> {
  const fd = await fs.open(file, "r+")
  try {
    const one = Buffer.alloc(1)
    await fd.read(one, 0, 1, position)
    one[0] ^= 0xff
    await fd.write(one, 0, 1, position)
  } finally {
    await fd.close()
  }
}

describe.runIf(canRunElectron)("asar.contentAlignment — real Electron with ASAR integrity fuses", () => {
  test.ifNotWindows("Electron launches with the integrity fuses on and reads every aligned file byte-exact", ({ expect }) => {
    const filler = fillerFiles()
    const expectedHashes = new Map<string, string>()
    for (const [rel, content] of filler) {
      expectedHashes.set(rel, createHash("sha256").update(content).digest("hex"))
    }
    const smokeModule = 'module.exports = { value: "aligned-ok" }\n'

    return app(
      expect,
      {
        targets: linuxDirTarget,
        config: {
          asar: { contentAlignment: ALIGNMENT },
          extraMetadata: { main: "smoke-main.js" },
          electronFuses: {
            runAsNode: false,
            enableCookieEncryption: false,
            enableNodeOptionsEnvironmentVariable: false,
            enableNodeCliInspectArguments: false,
            enableEmbeddedAsarIntegrityValidation: true,
            onlyLoadAppFromAsar: true,
            loadBrowserProcessSpecificV8Snapshot: false,
            grantFileProtocolExtraPrivileges: false,
          },
        },
      },
      {
        projectDirCreated: async projectDir => {
          await fs.writeFile(path.join(projectDir, "smoke-main.js"), SMOKE_MAIN)
          await fs.writeFile(path.join(projectDir, "smoke-module.js"), smokeModule)
          for (const [rel, content] of filler) {
            await fs.mkdir(path.dirname(path.join(projectDir, rel)), { recursive: true })
            await fs.writeFile(path.join(projectDir, rel), content)
          }
        },
        packed: async context => {
          const asarFile = path.join(context.getResources(Platform.LINUX), "app.asar")
          const { contentStart, files } = await packedFiles(asarFile)

          // the layout really is aligned, with at least one padding gap to poke at
          expect(files.length).toBeGreaterThan(filler.size)
          for (const file of files) {
            expect(file.offset % ALIGNMENT, `${file.rel} @ ${file.offset}`).toBe(0)
          }
          const gapAfter = files.find((file, i) => i + 1 < files.length && file.offset + file.size < files[i + 1].offset)
          expect(gapAfter, "expected a padding gap between two files").toBeDefined()

          const exe = await findExecutable(context.getAppPath(Platform.LINUX))

          // 1. the real thing: fuses on, aligned asar, every file readable and byte-exact
          const run = await runElectron(exe)
          const result = parseSmokeResult(run.stdout)
          expect(result, `Electron exited ${run.code}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`).not.toBeNull()
          expect(run.code).toBe(0)
          expect(result!.appPath.endsWith("app.asar")).toBe(true)
          expect(result!.moduleValue).toBe("aligned-ok")
          for (const [rel, hash] of expectedHashes) {
            expect(result!.files[rel], rel).toBe(hash)
          }
          expect(createHash("sha256").update(smokeModule).digest("hex")).toBe(result!.files["smoke-module.js"])

          // 2. control: a byte inside a padding gap is outside every file — Electron must not care
          await flipByte(asarFile, contentStart + gapAfter!.offset + gapAfter!.size)
          const gapRun = await runElectron(exe)
          expect(gapRun.code, `gap flip: stdout:\n${gapRun.stdout}\nstderr:\n${gapRun.stderr}`).toBe(0)
          expect(parseSmokeResult(gapRun.stdout)?.files).toEqual(result!.files)

          // 3. control: a byte inside a file's content is visible to the app — exactly that file's hash
          //    changes, every other file is untouched (reads go through the rewritten offsets)
          await flipByte(asarFile, contentStart + gapAfter!.offset + Math.floor(gapAfter!.size / 2))
          const tampered = await runElectron(exe)
          expect(tampered.code, `content flip: stdout:\n${tampered.stdout}\nstderr:\n${tampered.stderr}`).toBe(0)
          const tamperedFiles = parseSmokeResult(tampered.stdout)!.files
          expect(tamperedFiles[gapAfter!.rel]).not.toBe(result!.files[gapAfter!.rel])
          const { [gapAfter!.rel]: _a, ...restTampered } = tamperedFiles
          const { [gapAfter!.rel]: _b, ...restOriginal } = result!.files
          expect(restTampered).toEqual(restOriginal)
        },
      }
    )
  })
})
