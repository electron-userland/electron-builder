import { WinPackager } from "app-builder-lib"
import { SignManager } from "app-builder-lib/src/codeSign/win/signManager"
import { CustomWindowsSign, SigntoolSignManager } from "app-builder-lib/src/codeSign/win/signtoolBaseSignManager"
import { signWindows, WindowsSignFileResult, WindowsSignOptions } from "app-builder-lib/src/codeSign/win/windowsCodeSign"
import { WindowsConfiguration } from "app-builder-lib/src/options/winOptions"
import { AsyncTaskManager, log } from "builder-util"
import { Arch, DIR_TARGET, Platform, Target } from "electron-builder"
import { Packager } from "electron-builder"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, describe, test, vi } from "vitest"
import { app } from "../helpers/packTester"

// ─── helpers ──────────────────────────────────────────────────────────────────

function makePackagerWithManager(signFile: (options: WindowsSignOptions) => Promise<WindowsSignFileResult>): WinPackager {
  const manager = { signFile } as unknown as SignManager
  return {
    signingManager: { value: Promise.resolve(manager) },
  } as unknown as WinPackager
}

function infoMessages(spy: { mock: { calls: any[][] } }): string[] {
  // log.info(fieldsOrMessage, message?) — the message is the last string argument
  return spy.mock.calls.map(call => (typeof call[1] === "string" ? call[1] : (call[0] as string)))
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── signWindows: result plumbing and logging ─────────────────────────────────

describe("signWindows result and logging", () => {
  test(`returns "signed" and logs "signed with signtool.exe" for the default signtool configuration`, async ({ expect }) => {
    const infoSpy = vi.spyOn(log, "info")
    const packager = makePackagerWithManager(() => Promise.resolve("signed"))

    const result = await signWindows({ path: "/out/app.exe", options: { sign: { type: "signtool" } } as WindowsConfiguration }, packager)

    expect(result).toBe("signed")
    const messages = infoMessages(infoSpy)
    expect(messages).toContain("signed with signtool.exe")
    // the unconditional "Signing <file>..." pre-log was removed — the sign managers log "signing" with certificate details themselves
    expect(messages.some(m => m.startsWith("Signing "))).toBe(false)
    expect(messages.some(m => m.includes("skipped"))).toBe(false)
  })

  for (const [type, expectedMessage] of [
    ["azure", "signed with Azure Trusted Signing"],
    ["hsm", "signed with signtool.exe (HSM)"],
    ["pkcs11", "signed with osslsigncode (PKCS#11)"],
  ] as const) {
    test(`attributes "signed" to the configured signer (${type})`, async ({ expect }) => {
      const infoSpy = vi.spyOn(log, "info")
      const packager = makePackagerWithManager(() => Promise.resolve("signed"))

      const result = await signWindows({ path: "/out/app.exe", options: { sign: { type } } as unknown as WindowsConfiguration }, packager)

      expect(result).toBe("signed")
      expect(infoMessages(infoSpy)).toContain(expectedMessage)
    })
  }

  test(`attributes "signed:custom" to the custom sign hook instead of signtool.exe`, async ({ expect }) => {
    const infoSpy = vi.spyOn(log, "info")
    const packager = makePackagerWithManager(() => Promise.resolve("signed:custom"))

    const result = await signWindows({ path: "/out/app.exe", options: { sign: { type: "signtool" } } as WindowsConfiguration }, packager)

    expect(result).toBe("signed:custom")
    const messages = infoMessages(infoSpy)
    expect(messages).toContain("signed with custom `sign` hook")
    expect(messages).not.toContain("signed with signtool.exe")
  })

  test(`logs the skip reason and no past-tense "signed" message when no certificate is configured`, async ({ expect }) => {
    const infoSpy = vi.spyOn(log, "info")
    const packager = makePackagerWithManager(() => Promise.resolve("skipped:no-certificate"))

    const result = await signWindows({ path: "/out/app.exe", options: {} as WindowsConfiguration }, packager)

    expect(result).toBe("skipped:no-certificate")
    const messages = infoMessages(infoSpy)
    expect(messages).toContain("signing skipped")
    const skipCall = infoSpy.mock.calls.find(call => call[1] === "signing skipped")!
    expect(skipCall[0]).toMatchObject({ reason: "no code signing certificate configured" })
    expect(messages.some(m => m.includes("signed with"))).toBe(false)
    expect(messages.some(m => m.startsWith("Signing "))).toBe(false)
  })

  test("failures are rethrown, not converted to a result", async ({ expect }) => {
    const packager = makePackagerWithManager(() => Promise.reject(new Error("signtool exited with code 1")))
    await expect(signWindows({ path: "/out/app.exe", options: {} as WindowsConfiguration }, packager)).rejects.toThrow("signtool exited with code 1")
  })
})

// ─── SigntoolSignManager.signFile: skip reason and custom-hook attribution ────

describe("SigntoolSignManager.signFile result", () => {
  function makeManager(options: WindowsConfiguration, cscInfo: any = null): SigntoolSignManager {
    const manager = Object.create(SigntoolSignManager.prototype) as SigntoolSignManager
    ;(manager as any).packager = {
      appInfo: { productName: "Test App", type: "commonjs", computePackageUrl: () => Promise.resolve(null) },
      getWorkspaceRoot: () => Promise.resolve(process.cwd()),
      config: { toolsets: { winCodeSign: "1.1.0" } },
    }
    ;(manager as any).cscInfo = { value: Promise.resolve(cscInfo) }
    return manager
  }

  test(`returns "skipped:no-certificate" when there is no certificate and no custom sign hook`, async ({ expect }) => {
    const manager = makeManager({})
    await expect(manager.signFile({ path: "/out/app.exe", options: {} as WindowsConfiguration })).resolves.toBe("skipped:no-certificate")
  })

  test(`returns "signed:custom" when a custom sign hook does the signing`, async ({ expect }) => {
    const signedPaths: string[] = []
    const sign: CustomWindowsSign = configuration => {
      signedPaths.push(configuration.path)
      return Promise.resolve()
    }
    const options = { sign: { type: "signtool", sign, signingHashAlgorithms: ["sha256"] } } as unknown as WindowsConfiguration
    const manager = makeManager(options)

    await expect(manager.signFile({ path: "/out/app.exe", options })).resolves.toBe("signed:custom")
    expect(signedPaths).toEqual(["/out/app.exe"])
  })
})

// ─── WinPackager.signIf: extended skip reasons and forceCodeSigning ───────────

describe("WinPackager.signIf result", () => {
  function makeWinPackager(platformSpecificBuildOptions: WindowsConfiguration, signFileResult: WindowsSignFileResult | Error, forceCodeSigning = false): WinPackager {
    const packager = Object.create(WinPackager.prototype) as WinPackager
    ;(packager as any).platformSpecificBuildOptions = platformSpecificBuildOptions
    ;(packager as any).signingQueue = Promise.resolve()
    ;(packager as any).signingManager = {
      value: Promise.resolve({
        signFile: () => (signFileResult instanceof Error ? Promise.reject(signFileResult) : Promise.resolve(signFileResult)),
      }),
    }
    Object.defineProperty(packager, "forceCodeSigning", { value: forceCodeSigning })
    return packager
  }

  test(`returns "skipped:filtered" for a file excluded via signExts without invoking the sign manager`, async ({ expect }) => {
    const signFile = vi.fn()
    const packager = makeWinPackager({ signExts: ["!.txt"] } as WindowsConfiguration, "signed")
    ;(packager as any).signingManager = { value: Promise.resolve({ signFile }) }

    await expect(packager.signIf("/out/readme.txt")).resolves.toBe("skipped:filtered")
    expect(signFile).not.toHaveBeenCalled()
  })

  test(`returns "skipped:disabled" when signing is explicitly disabled`, async ({ expect }) => {
    const packager = makeWinPackager({ sign: false } as WindowsConfiguration, "signed")
    await expect(packager.signIf("/out/app.exe")).resolves.toBe("skipped:disabled")
  })

  test(`passes through "signed" from the sign manager`, async ({ expect }) => {
    const packager = makeWinPackager({}, "signed")
    await expect(packager.signIf("/out/app.exe")).resolves.toBe("signed")
  })

  test("forceCodeSigning still errors when signing is skipped for a missing certificate", async ({ expect }) => {
    const packager = makeWinPackager({}, "skipped:no-certificate", true)
    await expect(packager.signIf("/out/app.exe")).rejects.toThrow('App is not signed and "forceCodeSigning" is set to true')
  })

  test("forceCodeSigning does not error when the file was signed", async ({ expect }) => {
    const packager = makeWinPackager({}, "signed", true)
    await expect(packager.signIf("/out/app.exe")).resolves.toBe("signed")
  })
})

// ─── WinPackager.signApp: aggregated result gates the afterSign hook ──────────

describe("WinPackager.signApp result", () => {
  function makeSignAppTestPackager(resultHolder: { value: boolean | null }) {
    return class SignAppTestPackager extends WinPackager {
      constructor(info: Packager) {
        super(info)
      }

      async pack(outDir: string, arch: Arch, targets: Array<Target>, _taskManager: AsyncTaskManager): Promise<void> {
        await mkdir(outDir, { recursive: true })
        // deliberately NOT `${productFilename}.exe` so signApp signs it via signIf without resource editing
        await writeFile(path.join(outDir, "helper.exe"), "fake executable")
        const packContext = {
          appOutDir: outDir,
          outDir,
          arch,
          targets,
          packager: this,
          electronPlatformName: "win32" as const,
        }
        resultHolder.value = await this.signApp(packContext, false)
      }

      packageInDistributableFormat(_appOutDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): void {}
    }
  }

  test("returns false when nothing was signed (no certificate configured)", async ({ expect }) => {
    const resultHolder: { value: boolean | null } = { value: null }
    const PackagerClass = makeSignAppTestPackager(resultHolder)

    await app(expect, {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      platformPackagerFactory: info => new PackagerClass(info),
      config: {
        win: {},
      },
    })

    expect(resultHolder.value).toBe(false)
  })

  test("returns true when a custom sign hook signed at least one file", async ({ expect }) => {
    const resultHolder: { value: boolean | null } = { value: null }
    let hookCallCount = 0
    const sign: CustomWindowsSign = () => {
      hookCallCount++
      return Promise.resolve()
    }
    const PackagerClass = makeSignAppTestPackager(resultHolder)

    await app(expect, {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      platformPackagerFactory: info => new PackagerClass(info),
      config: {
        win: {
          sign: { type: "signtool", certificateFile: "secretFile", certificatePassword: "pass", signingHashAlgorithms: ["sha256"], sign },
        },
      },
    })

    expect(hookCallCount).toBeGreaterThan(0)
    expect(resultHolder.value).toBe(true)
  })
})
