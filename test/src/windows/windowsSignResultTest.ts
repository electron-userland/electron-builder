import { WinPackager } from "app-builder-lib"
import { AuthenticodeSignatureStatus, AuthenticodeSignerInfo } from "app-builder-lib/src/codeSign/win/authenticodeSignature"
import { SignManager } from "app-builder-lib/src/codeSign/win/signManager"
import { CustomWindowsSign, SigntoolSignManager } from "app-builder-lib/src/codeSign/win/signtoolBaseSignManager"
import { SignFileResult, SigningResult } from "app-builder-lib/src/codeSign/signResult"
import { signWindows, WindowsSignOptions } from "app-builder-lib/src/codeSign/win/windowsCodeSign"
import { WindowsConfiguration } from "app-builder-lib/src/options/winOptions"
import { AsyncTaskManager, InvalidConfigurationError, log } from "builder-util"
import { Arch, DIR_TARGET, Platform, Target } from "electron-builder"
import { Packager } from "electron-builder"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { Lazy } from "lazy-val"
import { afterEach, describe, test, vi } from "vitest"
import { app } from "../helpers/packTester"

// ─── helpers ──────────────────────────────────────────────────────────────────

function makePackagerWithManager(signFile: (options: WindowsSignOptions) => Promise<SignFileResult>): WinPackager {
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

    const result = await signWindows({ path: "/out/app.exe", options: { sign: { type: "signtool" } } }, packager)

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

    const result = await signWindows({ path: "/out/app.exe", options: { sign: { type: "signtool" } } }, packager)

    expect(result).toBe("signed:custom")
    const messages = infoMessages(infoSpy)
    expect(messages).toContain("signed with custom `sign` hook")
    expect(messages).not.toContain("signed with signtool.exe")
  })

  test(`logs the skip reason and no past-tense "signed" message when no certificate is configured`, async ({ expect }) => {
    const infoSpy = vi.spyOn(log, "info")
    const packager = makePackagerWithManager(() => Promise.resolve("skipped:no-certificate"))

    const result = await signWindows({ path: "/out/app.exe", options: {} }, packager)

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
    await expect(signWindows({ path: "/out/app.exe", options: {} }, packager)).rejects.toThrow("signtool exited with code 1")
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
    // the class fields signFile reads (Object.create skips the constructor)
    ;(manager as any).platformSpecificBuildOptions = options
    ;(manager as any).explicitPublisherNameValidation = new Lazy(() => (manager as any).validateExplicitPublisherName())
    return manager
  }

  test(`returns "skipped:no-certificate" when there is no certificate and no custom sign hook`, async ({ expect }) => {
    const manager = makeManager({})
    await expect(manager.signFile({ path: "/out/app.exe", options: {} })).resolves.toBe("skipped:no-certificate")
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

  test("a custom sign hook with a publisherName that is not a DN fails before the hook signs anything", async ({ expect }) => {
    const sign = vi.fn<CustomWindowsSign>(() => Promise.resolve())
    const options = { sign: { type: "signtool", sign, publisherName: "My Company", signingHashAlgorithms: ["sha256"] } } as unknown as WindowsConfiguration
    const manager = makeManager(options)

    await expect(manager.signFile({ path: "/out/app.exe", options })).rejects.toThrow(/Since electron-builder v27/)
    expect(sign).not.toHaveBeenCalled()
  })
})

// ─── WinPackager.signIf: extended skip reasons and forceCodeSigning ───────────

const SIGNED: AuthenticodeSignerInfo = { type: "signed", subject: "CN=Test", status: 0 }

function makeWinPackager(
  platformSpecificBuildOptions: WindowsConfiguration,
  signFileResult: SignFileResult | Error,
  forceCodeSigning = false,
  // forceCodeSigning reads every signed file back; the files signed here do not exist, so report them signed by default
  signer: AuthenticodeSignerInfo = SIGNED
): WinPackager {
  const packager = Object.create(WinPackager.prototype) as WinPackager
  ;(packager as any).platformSpecificBuildOptions = platformSpecificBuildOptions
  ;(packager as any).signingQueue = Promise.resolve()
  ;(packager as any).signingManager = {
    value: Promise.resolve({
      signFile: () => (signFileResult instanceof Error ? Promise.reject(signFileResult) : Promise.resolve(signFileResult)),
    }),
  }
  ;(packager as any).readAuthenticodeSignature = vi.fn(() => Promise.resolve(signer))
  Object.defineProperty(packager, "forceCodeSigning", { value: forceCodeSigning })
  return packager
}

describe("WinPackager.signIf result", () => {
  test(`returns "skipped:filtered" for a file excluded via signExts without invoking the sign manager`, async ({ expect }) => {
    const signFile = vi.fn()
    const packager = makeWinPackager({ signExts: ["!.txt"] }, "signed")
    ;(packager as any).signingManager = { value: Promise.resolve({ signFile }) }

    await expect(packager.signIf("/out/readme.txt")).resolves.toBe("skipped:filtered")
    expect(signFile).not.toHaveBeenCalled()
  })

  test(`returns "skipped:disabled" when signing is explicitly disabled`, async ({ expect }) => {
    const packager = makeWinPackager({ sign: false }, "signed")
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

// ─── forceCodeSigning: signed files are read back ──────────────────────────────

async function withPlatform<T>(platform: NodeJS.Platform, task: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
  try {
    return await task()
  } finally {
    Object.defineProperty(process, "platform", original)
  }
}

describe("WinPackager.signIf under forceCodeSigning", () => {
  test("reads the signed file back and accepts any status but HashMismatch", async ({ expect }) => {
    // UnknownError / NotTrusted: the build host does not trust the chain; null: the reader used off Windows has no status
    for (const status of [AuthenticodeSignatureStatus.Valid, AuthenticodeSignatureStatus.UnknownError, AuthenticodeSignatureStatus.NotTrusted, null]) {
      const packager = makeWinPackager({}, "signed:custom", true, { type: "signed", subject: "CN=Test", status })
      await expect(packager.signIf("/out/app.exe")).resolves.toBe("signed:custom")
      expect((packager as any).readAuthenticodeSignature).toHaveBeenCalledWith("/out/app.exe")
    }
  })

  test("fails when a file reported as signed carries no signature", async ({ expect }) => {
    const packager = makeWinPackager({}, "signed:custom", true, { type: "unsigned", reason: "empty PE certificate table" })
    const error = await packager.signIf("/out/app.exe").then(
      () => null,
      (e: any) => e
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.code).toBe("ERR_ELECTRON_BUILDER_VERIFICATION_FAILED")
    expect(error.message).toMatch(/forceCodeSigning is enabled, but the signed file .*app\.exe carries no Authenticode signature/)
    expect(error.message).toContain("must sign the file at configuration.path in place")
    expect(error.message).toContain("#forcecodesigning-covers-notarization-and-update-manifests")
  })

  test("fails when the signature does not match the file (HashMismatch)", async ({ expect }) => {
    const packager = makeWinPackager({}, "signed", true, { type: "signed", subject: "CN=Test", status: AuthenticodeSignatureStatus.HashMismatch })
    await expect(packager.signIf("/out/app.exe")).rejects.toThrow(/HashMismatch/)
  })

  test("an unreadable signature fails on Windows and only warns elsewhere", async ({ expect }) => {
    const unreadable: AuthenticodeSignerInfo = { type: "unreadable", reason: "Get-AuthenticodeSignature failed" }
    await withPlatform("win32", () => expect(makeWinPackager({}, "signed", true, unreadable).signIf("/out/app.exe")).rejects.toThrow(/cannot be read/))

    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await withPlatform("linux", () => expect(makeWinPackager({}, "signed", true, unreadable).signIf("/out/app.exe")).resolves.toBe("signed"))
    expect(warn.mock.calls.some(call => String(call[1]).includes("cannot read the Authenticode signature back"))).toBe(true)
  })

  test("a file type without Authenticode signatures is not read back", async ({ expect }) => {
    const packager = makeWinPackager({ signExts: [".js"] }, "signed:custom", true, { type: "unsigned", reason: "not a PE file" })
    await expect(packager.signIf("/out/script.js")).resolves.toBe("signed:custom")
    expect((packager as any).readAuthenticodeSignature).not.toHaveBeenCalled()
  })

  test("nothing is read back without forceCodeSigning", async ({ expect }) => {
    const packager = makeWinPackager({}, "signed:custom", false, { type: "unsigned", reason: "empty PE certificate table" })
    await expect(packager.signIf("/out/app.exe")).resolves.toBe("signed:custom")
    expect((packager as any).readAuthenticodeSignature).not.toHaveBeenCalled()
  })

  test("sign: false is rejected by signIf, which a prepackaged app's targets reach without signApp", async ({ expect }) => {
    await expect(makeWinPackager({ sign: false }, "signed", true).signIf("/out/App Setup.exe")).rejects.toThrow(
      "Signing is disabled (`sign: false`) but `forceCodeSigning` is enabled"
    )
  })

  test("a signExts exclusion is honored, with a warning", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    const packager = makeWinPackager({ signExts: ["!.msi"] }, "signed", true)
    await expect(packager.signIf("/out/App.msi")).resolves.toBe("skipped:filtered")
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: "excluded by signExts" }), "file is not signed although forceCodeSigning is enabled")
  })
})

describe("WinPackager.doPack: a prepackaged app under forceCodeSigning", () => {
  function makePrepackagedPackager(appOutDir: string, platformSpecificBuildOptions: WindowsConfiguration, signer: AuthenticodeSignerInfo = SIGNED, forceCodeSigning = true): any {
    const packager = makeWinPackager(platformSpecificBuildOptions, "signed", forceCodeSigning, signer) as any
    packager.info = { options: { prepackaged: appOutDir } }
    packager.appInfo = { productFilename: "App" }
    return packager
  }

  // PlatformPackager.doPack returns right away for a prepackaged app, so the override is all that runs
  const doPack = (packager: any, appOutDir: string): Promise<void> => (WinPackager.prototype as any).doPack.call(packager, { appOutDir })

  test("verifies the signature of the prepackaged executable", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.createTempDir()
    await writeFile(path.join(appOutDir, "App.exe"), "fake executable")
    const packager = makePrepackagedPackager(appOutDir, {})
    await doPack(packager, appOutDir)
    expect(packager.readAuthenticodeSignature).toHaveBeenCalledWith(path.join(appOutDir, "App.exe"))
  })

  test("fails when the prepackaged executable is not signed", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.createTempDir()
    await writeFile(path.join(appOutDir, "App.exe"), "fake executable")
    const packager = makePrepackagedPackager(appOutDir, {}, { type: "unsigned", reason: "empty PE certificate table" })
    await expect(doPack(packager, appOutDir)).rejects.toThrow(/the executable of the prepackaged app .*App\.exe carries no Authenticode signature/)
  })

  test("fails when the prepackaged app has no executable", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.createTempDir()
    await expect(doPack(makePrepackagedPackager(appOutDir, {}), appOutDir)).rejects.toThrow(/the prepackaged app has no .*App\.exe/)
  })

  test("sign: false fails with the same message as a normal build", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.createTempDir()
    await expect(doPack(makePrepackagedPackager(appOutDir, { sign: false }), appOutDir)).rejects.toThrow("Signing is disabled (`sign: false`) but `forceCodeSigning` is enabled")
  })

  test("a signExts exclusion of the executable is honored, with a warning", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.createTempDir()
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    const packager = makePrepackagedPackager(appOutDir, { signExts: ["!.exe"] })
    await doPack(packager, appOutDir)
    expect(packager.readAuthenticodeSignature).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "excluded by signExts" }),
      "the prepackaged app's executable is not verified although forceCodeSigning is enabled"
    )
  })

  test("nothing is checked without forceCodeSigning", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.createTempDir()
    const packager = makePrepackagedPackager(appOutDir, {}, { type: "unsigned", reason: "empty PE certificate table" }, false)
    await doPack(packager, appOutDir)
    expect(packager.readAuthenticodeSignature).not.toHaveBeenCalled()
  })
})

// ─── WinPackager.signApp: aggregated result gates the afterSign hook ──────────

describe("WinPackager.signApp result", () => {
  function makeSignAppTestPackager(resultHolder: { value: SigningResult | null }) {
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

  test(`returns "skipped:no-certificate" when nothing was signed (no certificate configured)`, async ({ expect }) => {
    const resultHolder: { value: SigningResult | null } = { value: null }
    const PackagerClass = makeSignAppTestPackager(resultHolder)

    await app(expect, {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      platformPackagerFactory: info => new PackagerClass(info),
      config: {
        win: {},
      },
    })

    expect(resultHolder.value).toBe("skipped:no-certificate")
  })

  test(`returns "signed:custom" when a custom sign hook signed at least one file`, async ({ expect }) => {
    const resultHolder: { value: SigningResult | null } = { value: null }
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
    expect(resultHolder.value).toBe("signed:custom")
  })
})
