import { parseDn } from "builder-util-runtime"
import { WinPackager } from "app-builder-lib"
import { WindowsSigntoolSigningConfig } from "app-builder-lib/src/options/winOptions"
import { Configuration, CustomWindowsSign } from "app-builder-lib/internal"
import { AsyncTaskManager } from "builder-util"
import { Arch, DIR_TARGET, Platform, Target } from "electron-builder"
import { Packager } from "electron-builder"
import { load } from "js-yaml"
import * as path from "path"
import { app, appThrows } from "../helpers/packTester"

type SignIfResult = { file: string; ok: boolean }

const baseSigningConfig: WindowsSigntoolSigningConfig = {
  type: "signtool",
  certificateFile: "secretFile",
  certificatePassword: "pass",
  signingHashAlgorithms: ["sha256"],
}

const signtoolBaseConfig: Configuration = {
  toolsets: { winCodeSign: "1.1.0" },
  win: {
    sign: baseSigningConfig,
  },
}

function makeSignQueueTestPackager(signIfResults: SignIfResult[]) {
  return class SignQueueTestPackager extends WinPackager {
    constructor(info: Packager) {
      super(info)
    }

    async pack(outDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): Promise<void> {
      const files = ["file1.exe", "file2.exe", "file3.exe"].map(f => path.join(outDir, f))
      await Promise.all(
        files.map(f =>
          this.signIf(f).then(
            () => signIfResults.push({ file: path.basename(f), ok: true }),
            () => signIfResults.push({ file: path.basename(f), ok: false })
          )
        )
      )
    }

    packageInDistributableFormat(_appOutDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): void {}
  }
}

function makeSequentialSignTestPackager() {
  return class SequentialSignTestPackager extends WinPackager {
    constructor(info: Packager) {
      super(info)
    }

    async pack(outDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): Promise<void> {
      for (const f of ["file1.exe", "file2.exe", "file3.exe"].map(n => path.join(outDir, n))) {
        await this.signIf(f)
      }
    }

    packageInDistributableFormat(_appOutDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): void {}
  }
}

test("parseDn", ({ expect }) => {
  expect(parseDn("CN=7digital Limited, O=7digital Limited, L=London, C=GB")).toMatchSnapshot()

  expect(load("publisherName:\n  - 7digital Limited")).toMatchObject({ publisherName: ["7digital Limited"] })
})

describe("signing queue", () => {
  describe("normal flow", () => {
    test("signs all files when no errors occur", async ({ expect }) => {
      let callCount = 0
      const results: SignIfResult[] = []

      const sign: CustomWindowsSign = () => {
        callCount++
        return Promise.resolve()
      }

      const PackagerClass = makeSignQueueTestPackager(results)

      await app(expect, {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        platformPackagerFactory: (info, _platform) => new PackagerClass(info),
        config: {
          ...signtoolBaseConfig,
          win: { sign: { ...baseSigningConfig, sign } },
        },
      })

      expect(callCount).toBe(3)
      expect(results.every(r => r.ok)).toBe(true)
      expect(results.map(r => r.file)).toContain("file1.exe")
      expect(results.map(r => r.file)).toContain("file2.exe")
      expect(results.map(r => r.file)).toContain("file3.exe")
    })
  })

  describe("queue recovery", () => {
    test("signs subsequent files after a transient rejection on file2", async ({ expect }) => {
      let callCount = 0
      const signedFiles: string[] = []
      const results: SignIfResult[] = []

      const sign: CustomWindowsSign = config => {
        callCount++
        if (path.basename(config.path) === "file2.exe") {
          throw new Error("transient signing error")
        }
        signedFiles.push(path.basename(config.path))
        return Promise.resolve()
      }

      const PackagerClass = makeSignQueueTestPackager(results)

      await app(expect, {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        platformPackagerFactory: (info, _platform) => new PackagerClass(info),
        config: {
          ...signtoolBaseConfig,
          win: { sign: { ...baseSigningConfig, sign } },
        },
      })

      // All 3 files must be attempted — proves queue was not permanently broken
      expect(callCount).toBe(3)
      expect(signedFiles).toContain("file1.exe")
      expect(signedFiles).not.toContain("file2.exe")
      expect(signedFiles).toContain("file3.exe")

      // Rejection from file2 must propagate to its caller
      expect(results.find(r => r.file === "file2.exe")?.ok).toBe(false)
      // file3 must resolve successfully after queue recovery
      expect(results.find(r => r.file === "file3.exe")?.ok).toBe(true)
    })

    test("rejection propagates to caller even with forceCodeSigning enabled", async ({ expect }) => {
      let callCount = 0
      const results: SignIfResult[] = []

      const sign: CustomWindowsSign = config => {
        callCount++
        if (path.basename(config.path) === "file2.exe") {
          throw new Error("transient signing error")
        }
        return Promise.resolve()
      }

      const PackagerClass = makeSignQueueTestPackager(results)

      await app(expect, {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        platformPackagerFactory: (info, _platform) => new PackagerClass(info),
        config: {
          ...signtoolBaseConfig,
          win: {
            sign: { ...baseSigningConfig, sign },
            forceCodeSigning: true,
          },
        },
      })

      // Queue must recover regardless of forceCodeSigning
      expect(callCount).toBe(3)
      expect(results.find(r => r.file === "file2.exe")?.ok).toBe(false)
      expect(results.find(r => r.file === "file3.exe")?.ok).toBe(true)
    })

    test("forceCodeSigning: true — transient error on any file propagates to a build failure", async ({ expect }) => {
      const sign: CustomWindowsSign = () => {
        throw new Error("transient signing error")
      }

      const PackagerClass = makeSequentialSignTestPackager()

      await appThrows(
        expect,
        {
          targets: Platform.WINDOWS.createTarget(DIR_TARGET),
          platformPackagerFactory: (info, _platform) => new PackagerClass(info),
          config: {
            ...signtoolBaseConfig,
            win: {
              sign: { ...baseSigningConfig, sign },
              forceCodeSigning: true,
            },
          },
        },
        {},
        error => expect(error.message).toContain("transient signing error")
      )
    })
  })
})

describe("sign: false (signing disabled)", () => {
  test("signIf skips every file even when a cert is discoverable via env", async ({ expect }) => {
    const signResults: boolean[] = []

    class SignDisabledTestPackager extends WinPackager {
      async pack(outDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): Promise<void> {
        for (const f of ["file1.exe", "file2.exe", "file3.exe"].map(n => path.join(outDir, n))) {
          signResults.push(await this.signIf(f))
        }
      }

      packageInDistributableFormat(_appOutDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): void {}
    }

    await app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        platformPackagerFactory: (info, _platform) => new SignDisabledTestPackager(info),
        config: {
          win: { sign: false },
        },
      },
      // signedWin sets WIN_CSC_LINK, so a cert is discoverable — sign: false must still short-circuit
      { signedWin: true }
    )

    expect(signResults).toEqual([false, false, false])
  })
})
