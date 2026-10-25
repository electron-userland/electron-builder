import { Platform } from "app-builder-lib"
import { MacTargetHelper } from "app-builder-lib/internal"
import { findIdentity } from "app-builder-lib/src/codeSign/mac/macCodeSign.js"
import { checkInstallerPackageSignature, verifyMacCodeSignature } from "app-builder-lib/src/codeSign/mac/macSignatureVerifier.js"
import { PkgTarget } from "app-builder-lib/src/targets/mac/pkg.js"
import { Arch, exec, Executables, InvalidConfigurationError, log } from "builder-util"
import { DmgTarget } from "dmg-builder"
import { writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// codesign / productbuild / pkgutil, and keychain lookups, are stubbed: these tests run on every host
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn() }
})

vi.mock("app-builder-lib/src/codeSign/mac/macCodeSign.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/codeSign/mac/macCodeSign.js")>()
  return { ...actual, findIdentity: vi.fn() }
})

vi.mock("app-builder-lib/src/codeSign/mac/macSignatureVerifier.js", () => ({
  verifyMacCodeSignature: vi.fn(),
  validateStapledTicket: vi.fn(),
  checkInstallerPackageSignature: vi.fn(),
}))

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!
const identity = { name: "Developer ID Application: Foo (TEAM123456)", hash: "0123456789ABCDEF0123456789ABCDEF01234567" } as any

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

beforeEach(() => {
  for (const name of ["GITHUB_BASE_REF", "TRAVIS_PULL_REQUEST", "CIRCLE_PULL_REQUEST", "BITRISE_PULL_REQUEST", "APPVEYOR_PULL_REQUEST_NUMBER", "CSC_FOR_PULL_REQUEST"]) {
    vi.stubEnv(name, undefined)
  }
  setPlatform("darwin")
  vi.mocked(exec).mockReset().mockResolvedValue("")
  // the default locations on macOS, which exist on macOS only
  vi.spyOn(Executables, "resolve").mockImplementation(name => `/usr/bin/${name}`)
  vi.mocked(findIdentity).mockReset().mockResolvedValue(identity)
  vi.mocked(verifyMacCodeSignature).mockReset().mockResolvedValue(null)
  vi.mocked(checkInstallerPackageSignature).mockReset().mockResolvedValue(null)
})

afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("DMG signing (dmg.sign: true) under forceCodeSigning", () => {
  function makeDmgPackager(macConfig: any, forceCodeSigning = true): any {
    return {
      forceCodeSigning,
      platform: Platform.MAC,
      platformOptions: macConfig,
      codeSigningInfo: { value: Promise.resolve({ keychainFile: null }) },
    }
  }

  // signDmg only touches `this.packager`
  const signDmg = (packager: any) => (DmgTarget.prototype as any).signDmg.call({ packager }, "/out/My-1.0.0.dmg")

  test("every case that silently left the DMG unsigned fails", async ({ expect }) => {
    setPlatform("linux")
    await expect(signDmg(makeDmgPackager({}))).rejects.toThrow("macOS code signing needs a macOS host")
    setPlatform("darwin")

    vi.stubEnv("GITHUB_BASE_REF", "main")
    await expect(signDmg(makeDmgPackager({}))).rejects.toThrow("this is a pull-request build")
    vi.stubEnv("GITHUB_BASE_REF", undefined)

    await expect(signDmg(makeDmgPackager({ sign: null }))).rejects.toThrow(/dmg\.sign is true, but the DMG .*My-1\.0\.0\.dmg cannot be signed: mac\.sign is null/)
    await expect(signDmg(makeDmgPackager({ sign: { identity: null } }))).rejects.toThrow("cannot be signed: mac.sign.identity is null")

    vi.mocked(findIdentity).mockResolvedValue(null)
    const error = await signDmg(makeDmgPackager({})).then(
      () => null,
      (e: any) => e
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain('cannot be signed: no "Developer ID Application" or "Mac Developer" identity was found')
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("the signed DMG is verified with codesign --verify", async ({ expect }) => {
    await signDmg(makeDmgPackager({}))
    expect(vi.mocked(exec)).toHaveBeenCalledWith("/usr/bin/codesign", ["--sign", identity.hash, "/out/My-1.0.0.dmg"])
    expect(verifyMacCodeSignature).toHaveBeenCalledWith("/out/My-1.0.0.dmg", { deep: false })

    vi.mocked(verifyMacCodeSignature).mockResolvedValue("invalid signature (code or signature have been modified)")
    const error = await signDmg(makeDmgPackager({})).then(
      () => null,
      (e: any) => e
    )
    expect(error.code).toBe("ERR_ELECTRON_BUILDER_VERIFICATION_FAILED")
    expect(error.message).toMatch(/the signed DMG .*My-1\.0\.0\.dmg does not verify \(codesign --verify: invalid signature/)
  })

  test("without forceCodeSigning, the skips stay silent and nothing is verified", async ({ expect }) => {
    setPlatform("linux")
    await expect(signDmg(makeDmgPackager({}, false))).resolves.toBeUndefined()
    setPlatform("darwin")
    vi.mocked(findIdentity).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    await expect(signDmg(makeDmgPackager({}, false))).resolves.toBeUndefined()
    await signDmg(makeDmgPackager({}, false))
    expect(vi.mocked(exec)).toHaveBeenCalledTimes(1)
    expect(verifyMacCodeSignature).not.toHaveBeenCalled()
  })
})

describe("the pkg installer under forceCodeSigning", () => {
  function makePkgTarget(outDir: string, forceCodeSigning: boolean): any {
    const packager: any = {
      forceCodeSigning,
      // the pkg installer is the macOS app's
      forceCodeSigningFor: (platformType: string) => platformType === "mac" && forceCodeSigning,
      appInfo: { id: "com.example.my" },
      // notarization has its own tests
      platformOptions: { notarize: false },
      getOptionsForTarget: () => ({}),
      expandArtifactNamePattern: () => "My-1.0.0.pkg",
      emitArtifactBuildStarted: vi.fn(() => Promise.resolve()),
      emitArtifactBuildCompleted: vi.fn(() => Promise.resolve()),
      computeSafeArtifactName: () => null,
      codeSigningInfo: { value: Promise.resolve({ keychainFile: null }) },
    }
    packager.helper = new MacTargetHelper(packager)
    const target: any = new PkgTarget(packager, outDir)
    // the distribution and the component package are built with Apple's tools; they only have to exist here
    target.customizeDistributionConfiguration = vi.fn((distInfoFile: string) => writeFile(distInfoFile, "<installer-gui-script/>"))
    target.buildComponentPackage = vi.fn((_appPath: string, _plist: string, packageFile: string) => writeFile(packageFile, "component"))
    return target
  }

  test("is checked with pkgutil after productbuild signed it, before it is notarized", async ({ expect, tmpDir }) => {
    vi.spyOn(log, "warn").mockImplementation(() => undefined)
    const outDir = await tmpDir.createTempDir()
    const target = makePkgTarget(outDir, true)
    vi.mocked(checkInstallerPackageSignature).mockResolvedValue("pkgutil --check-signature: no signature")
    await expect(target.build("/out/mac/My.app", Arch.x64)).rejects.toThrow(/the installer package .*My-1\.0\.0\.pkg is not validly signed/)
    expect(checkInstallerPackageSignature).toHaveBeenCalledWith(path.join(outDir, "My-1.0.0.pkg"))
    expect(target.packager.emitArtifactBuildCompleted).not.toHaveBeenCalled()
  })

  test("is not checked without forceCodeSigning", async ({ expect, tmpDir }) => {
    const target = makePkgTarget(await tmpDir.createTempDir(), false)
    await target.build("/out/mac/My.app", Arch.x64)
    expect(checkInstallerPackageSignature).not.toHaveBeenCalled()
    expect(target.packager.emitArtifactBuildCompleted).toHaveBeenCalledTimes(1)
  })
})
