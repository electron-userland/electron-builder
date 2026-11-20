import { serializeToYaml } from "builder-util"
import { GenericServerOptions } from "builder-util-runtime"
import { MacUpdater } from "electron-updater"
import { EventEmitter } from "events"
import fsExtra from "fs-extra"
import * as path from "path"
import { afterEach, describe, test, vi } from "vitest"
import { mockForNodeRequire } from "vitest-mock-commonjs"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createTestAppAdapter, tuneTestUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// MacUpdater asks `sysctl sysctl.proc_translated` whether the app runs under Rosetta (an x64 app on an arm64 Mac), and then prefers the
// arm64 update files like on any arm64 Mac. The mac blackbox suites update arm64 and universal apps only, so this is where it is checked.
const { execFileSync } = vi.hoisted(() => ({ execFileSync: vi.fn() }))
vi.mock("child_process", async importOriginal => ({ ...(await importOriginal<typeof import("child_process")>()), execFileSync }))

const X64_FILE = "TestApp-1.1.0-x64.dmg"
const ARM64_FILE = "TestApp-1.1.0-arm64.dmg"
/** The error of a download whose served files, after the arch filter, are `file` alone. */
const onlyFileLeft = (file: string) => new RegExp(`^ZIP file not provided: http://127\\.0\\.0\\.1:\\d+/${file.replace(/\./g, "\\.")}$`)
const INTEL_UNAME = "Darwin host.local 24.0.0 Darwin Kernel Version 24.0.0: root:xnu-11215.1.10~2/RELEASE_X86_64 x86_64\n"

const realArch = Object.getOwnPropertyDescriptor(process, "arch")
afterEach(() => {
  if (realArch != null) {
    Object.defineProperty(process, "arch", realArch)
  }
  execFileSync.mockReset()
})

/**
 * The update files that the arch filter of an x64 process leaves, when `sysctl` answers `sysctl` (or fails): the served update has one
 * x64 and one arm64 file and no zip, so the download fails with an error that names them.
 */
async function filesLeftForX64Process(tmpDir: import("temp-file").TmpDir, sysctl: () => string): Promise<{ code?: string; message: string }> {
  Object.defineProperty(process, "arch", { ...realArch, value: "x64" })
  execFileSync.mockImplementation((file: string) => {
    if (file === "/usr/sbin/sysctl") {
      return sysctl()
    }
    if (file === "/usr/bin/uname") {
      return INTEL_UNAME
    }
    throw new Error(`unexpected ${file}`)
  })
  mockForNodeRequire("electron", { autoUpdater: new EventEmitter() })

  const root = await tmpDir.getTempDir({ prefix: "mac-updater-rosetta-test" })
  await fsExtra.outputFile(
    path.join(root, "latest-mac.yml"),
    serializeToYaml({
      version: "1.1.0",
      files: [X64_FILE, ARM64_FILE].map(url => ({ url, sha512: "abc", size: 1 })),
      releaseDate: "2024-01-01T00:00:00.000Z",
    })
  )
  const { server, port } = await createLocalServer(root)
  try {
    const updater = new MacUpdater(undefined, await createTestAppAdapter())
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: `http://127.0.0.1:${port}` })
    tuneTestUpdater(updater)
    updater._testOnlyOptions!.platform = "darwin"
    const updateCheckResult = await updater.checkForUpdates()
    return await updateCheckResult!.downloadPromise!.then(
      () => ({ message: "downloaded" }),
      (e: Error & { code?: string }) => e
    )
  } finally {
    server.close()
  }
}

describe("MacUpdater under Rosetta", () => {
  test("an x64 app translated by Rosetta takes the arm64 update files", async ({ expect, tmpDir }) => {
    const error = await filesLeftForX64Process(tmpDir, () => "sysctl.proc_translated: 1\n")
    expect(error.code).toBe("ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    expect(error.message).toMatch(onlyFileLeft(ARM64_FILE))
    expect(execFileSync).toHaveBeenCalledWith("/usr/sbin/sysctl", ["sysctl.proc_translated"], { encoding: "utf8" })
  })

  test("an x64 app on an Intel Mac takes the x64 update files", async ({ expect, tmpDir }) => {
    const error = await filesLeftForX64Process(tmpDir, () => "sysctl.proc_translated: 0\n")
    expect(error.code).toBe("ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    expect(error.message).toMatch(onlyFileLeft(X64_FILE))
  })

  test("a failed Rosetta check is taken for no Rosetta", async ({ expect, tmpDir }) => {
    // older macOS (and Intel Macs) have no sysctl.proc_translated: sysctl exits with an error
    const error = await filesLeftForX64Process(tmpDir, () => {
      throw new Error("sysctl: unknown oid 'sysctl.proc_translated'")
    })
    expect(error.code).toBe("ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    expect(error.message).toMatch(onlyFileLeft(X64_FILE))
  })
})
