import { checkInstallerPackageSignature, pkgutilSignatureProblem, validateStapledTicket, verifyMacCodeSignature } from "app-builder-lib/src/codeSign/mac/macSignatureVerifier.js"
import { exec, Executables, InvalidConfigurationError } from "builder-util"
import { defaultExecutableLocations } from "builder-util/src/executables"
import { chmod, copyFile, mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { pathToFileURL } from "url"
import { afterEach, beforeEach, vi } from "vitest"

// exec runs the real tools unless a test queues a result for the next call
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn((...args: Parameters<typeof actual.exec>) => actual.exec(...args)) }
})

const STAPLER = "/Applications/Xcode.app/Contents/Developer/usr/bin/stapler"

describe("macSignatureVerifier", () => {
  beforeEach(() => {
    // the default locations on macOS, which exist on macOS only (the wiring to toolsets.executables is tested below)
    vi.spyOn(Executables, "resolve").mockImplementation(name => defaultExecutableLocations(name, "darwin")[0])
    vi.spyOn(Executables, "stapler").mockResolvedValue(STAPLER)
  })

  afterEach(() => {
    vi.mocked(Executables.resolve).mockRestore()
    vi.mocked(Executables.stapler).mockRestore()
  })

  test("verifyMacCodeSignature runs codesign --verify --deep --strict for an app by default", async ({ expect }) => {
    vi.mocked(exec).mockResolvedValueOnce("")
    expect(await verifyMacCodeSignature("/out/mac/My.app", { deep: true })).toBeNull()
    expect(vi.mocked(exec)).toHaveBeenLastCalledWith("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", "/out/mac/My.app"], undefined, false)
  })

  test("strict mirrors osx-sign's strictVerify, and a single file is verified without --deep", async ({ expect }) => {
    vi.mocked(exec).mockResolvedValueOnce("")
    await verifyMacCodeSignature("/out/My.dmg", { deep: false, strict: false })
    expect(vi.mocked(exec)).toHaveBeenLastCalledWith("/usr/bin/codesign", ["--verify", "--verbose=2", "/out/My.dmg"], undefined, false)

    vi.mocked(exec).mockResolvedValueOnce("")
    await verifyMacCodeSignature("/out/mac/My.app", { deep: true, strict: "all" })
    expect(vi.mocked(exec)).toHaveBeenLastCalledWith("/usr/bin/codesign", ["--verify", "--deep", "--strict=all", "--verbose=2", "/out/mac/My.app"], undefined, false)
  })

  test("a strictVerify list is rebuilt from codesign's --strict keywords, and anything else is a configuration error", async ({ expect }) => {
    vi.mocked(exec).mockResolvedValueOnce("")
    await verifyMacCodeSignature("/out/mac/My.app", { deep: true, strict: " symlinks, sideband " })
    expect(vi.mocked(exec)).toHaveBeenLastCalledWith("/usr/bin/codesign", ["--verify", "--deep", "--strict=symlinks,sideband", "--verbose=2", "/out/mac/My.app"], undefined, false)

    vi.mocked(exec).mockClear()
    for (const strict of ["symlinks --deep", "all;rm", "", "symlinks,,all"]) {
      const error = await verifyMacCodeSignature("/out/mac/My.app", { deep: true, strict }).catch((e: unknown) => e)
      expect(error, strict).toBeInstanceOf(InvalidConfigurationError)
      expect((error as Error).message).toContain("mac.sign.strictVerify")
    }
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("a failed check returns the tool's complaint without terminal colors", async ({ expect }) => {
    vi.mocked(exec).mockRejectedValueOnce(
      new Error("\u001b[31mExit code: 1. Command failed: /usr/bin/codesign\u001b[39m\n\u001b[31mMy.app: code object is not signed at all\u001b[39m")
    )
    expect(await verifyMacCodeSignature("/out/mac/My.app", { deep: true })).toBe("Exit code: 1. Command failed: /usr/bin/codesign\nMy.app: code object is not signed at all")
  })

  test("validateStapledTicket runs stapler validate", async ({ expect }) => {
    vi.mocked(exec).mockResolvedValueOnce("The validate action worked!")
    expect(await validateStapledTicket("/out/mac/My.app")).toBeNull()
    expect(vi.mocked(exec)).toHaveBeenLastCalledWith(STAPLER, ["validate", "/out/mac/My.app"], undefined, false)
  })

  test("pkgutilSignatureProblem accepts any signed status, and rejects a missing, invalid or revoked signature", ({ expect }) => {
    const pkgutil = (status: string) => `Package "My.pkg":\n   Status: ${status}\n   Certificate Chain:\n`
    // any valid signature counts, even one by an untrusted or expired certificate
    for (const status of [
      "signed by a developer certificate issued by Apple for distribution",
      "signed by a certificate trusted by macOS",
      "signed by untrusted certificate",
      "signed Apple Software",
    ]) {
      expect(pkgutilSignatureProblem(pkgutil(status)), status).toBeNull()
    }
    expect(pkgutilSignatureProblem(pkgutil("no signature"))).toBe("pkgutil --check-signature: no signature")
    expect(pkgutilSignatureProblem(pkgutil("invalid signature"))).toBe("pkgutil --check-signature: invalid signature")
    expect(pkgutilSignatureProblem(pkgutil("signed by a revoked certificate"))).toBe("pkgutil --check-signature: signed by a revoked certificate")
    expect(pkgutilSignatureProblem("Error: unable to open package")).toContain("reported no signature status")
  })

  test("checkInstallerPackageSignature decides on the Status line, also when pkgutil exits non-zero", async ({ expect }) => {
    vi.mocked(exec).mockRejectedValueOnce(new Error('Exit code: 1. Command failed\n\u001b[33mPackage "My.pkg":\n   Status: no signature\n\u001b[39m'))
    expect(await checkInstallerPackageSignature("/out/My.pkg")).toBe("pkgutil --check-signature: no signature")

    vi.mocked(exec).mockRejectedValueOnce(new Error('Exit code: 1. Command failed\nPackage "My.pkg":\n   Status: signed by untrusted certificate\n'))
    expect(await checkInstallerPackageSignature("/out/My.pkg")).toBeNull()
    expect(vi.mocked(exec)).toHaveBeenLastCalledWith("/usr/sbin/pkgutil", ["--check-signature", "/out/My.pkg"], undefined, false)
  })
})

// The real Executables, on a pinned macOS host: the tools come from toolsets.executables, never from PATH
describe.skipIf(process.platform === "win32")("macSignatureVerifier tool locations", { concurrent: false }, () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
    vi.mocked(exec).mockClear()
  })

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
  })

  async function fakeTool(dir: string, name: string): Promise<string> {
    const file = path.join(dir, name)
    await mkdir(dir, { recursive: true })
    await writeFile(file, "#!/bin/sh\n")
    await chmod(file, 0o755)
    return file
  }

  test("codesign, stapler and pkgutil come from toolsets.executables", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "mac-verifier-tools" })
    const [codesign, stapler, pkgutil] = await Promise.all(["codesign", "stapler", "pkgutil"].map(it => fakeTool(dir, it)))
    const executables = { codesign: pathToFileURL(codesign).href, stapler: pathToFileURL(stapler).href, pkgutil: pathToFileURL(pkgutil).href }
    vi.mocked(exec).mockResolvedValueOnce("").mockResolvedValueOnce("").mockResolvedValueOnce("Status: signed by a certificate trusted by macOS")
    await Executables.run(executables, async () => {
      expect(await verifyMacCodeSignature("/out/My.dmg", { deep: false })).toBeNull()
      expect(await validateStapledTicket("/out/My.dmg")).toBeNull()
      expect(await checkInstallerPackageSignature("/out/My.pkg")).toBeNull()
    })
    expect(vi.mocked(exec).mock.calls.map(call => call[0])).toEqual([codesign, stapler, pkgutil])
  })

  test("a tool that cannot be located is a configuration error, not a signature problem, and nothing is started", async ({ expect, tmpDir }) => {
    const missing = path.join(await tmpDir.getTempDir({ prefix: "mac-verifier-tools" }), "missing")
    const uri = pathToFileURL(missing).href
    await Executables.run({ codesign: uri, stapler: uri, pkgutil: uri }, async () => {
      await expect(verifyMacCodeSignature("/out/My.dmg", { deep: false })).rejects.toBeInstanceOf(InvalidConfigurationError)
      await expect(validateStapledTicket("/out/My.dmg")).rejects.toThrow("toolsets.executables.stapler")
      await expect(checkInstallerPackageSignature("/out/My.pkg")).rejects.toThrow("toolsets.executables.pkgutil")
    })
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })
})

describe.ifMac("macSignatureVerifier with Apple's tools", () => {
  test("an ad-hoc signature passes codesign --verify: any valid signature counts", async ({ expect, tmpDir }) => {
    const binary = path.join(await tmpDir.createTempDir(), "tool")
    await copyFile("/usr/bin/true", binary)
    await exec("/usr/bin/codesign", ["--sign", "-", "--force", binary])
    expect(await verifyMacCodeSignature(binary, { deep: false })).toBeNull()
  })

  test("a file without a signature fails codesign --verify", async ({ expect, tmpDir }) => {
    const file = path.join(await tmpDir.createTempDir(), "plain.txt")
    await writeFile(file, "not signed")
    expect(await verifyMacCodeSignature(file, { deep: false })).toContain("not signed at all")
  })

  test("an unsigned installer package fails pkgutil --check-signature", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    await mkdir(path.join(dir, "root", "opt", "my"), { recursive: true })
    await writeFile(path.join(dir, "root", "opt", "my", "file.txt"), "payload")
    const pkg = path.join(dir, "unsigned.pkg")
    await exec("/usr/bin/pkgbuild", ["--root", path.join(dir, "root"), "--identifier", "com.example.unsigned", "--version", "1.0.0", pkg])
    expect(await checkInstallerPackageSignature(pkg)).toBe("pkgutil --check-signature: no signature")
  })
})
