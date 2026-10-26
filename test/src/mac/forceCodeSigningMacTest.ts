import { MacPackager, Platform } from "app-builder-lib"
import { MacTargetHelper } from "app-builder-lib/internal"
import { findIdentity } from "app-builder-lib/src/codeSign/mac/macCodeSign.js"
import { checkInstallerPackageSignature, validateStapledTicket, verifyMacCodeSignature } from "app-builder-lib/src/codeSign/mac/macSignatureVerifier.js"
import { Arch, Executables, InvalidConfigurationError, log } from "builder-util"
import { DIR_TARGET } from "electron-builder"
import { afterEach, beforeEach, vi } from "vitest"
import { appThrows } from "../helpers/packTester"

// the test package does not depend on @electron/notarize, so mock the very module app-builder-lib imports
const { notarize } = vi.hoisted(() => ({ notarize: vi.fn() }))
vi.mock("../../../packages/app-builder-lib/node_modules/@electron/notarize/lib/index.js", () => ({ notarize }))

// codesign / stapler / pkgutil exist on macOS only
vi.mock("app-builder-lib/src/codeSign/mac/macSignatureVerifier.js", () => ({
  verifyMacCodeSignature: vi.fn(),
  validateStapledTicket: vi.fn(),
  checkInstallerPackageSignature: vi.fn(),
}))

// keychain lookups must not depend on the identities of the machine running the tests
vi.mock("app-builder-lib/src/codeSign/mac/macCodeSign.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/codeSign/mac/macCodeSign.js")>()
  return { ...actual, findIdentity: vi.fn() }
})

vi.mock("app-builder-lib/src/util/mac/macosVersion.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/mac/macosVersion.js")>()
  return { ...actual, isMacOsHighSierra: () => true }
})

const PULL_REQUEST_ENV = ["GITHUB_BASE_REF", "TRAVIS_PULL_REQUEST", "CIRCLE_PULL_REQUEST", "BITRISE_PULL_REQUEST", "APPVEYOR_PULL_REQUEST_NUMBER", "CSC_FOR_PULL_REQUEST"]
const NOTARIZATION_ENV = [
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
  "APPLE_KEYCHAIN",
  "APPLE_KEYCHAIN_PROFILE",
]
const DOCS = "https://www.electron.build/docs/migration/v27-build-changes#forcecodesigning-covers-notarization-and-update-manifests"

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

beforeEach(() => {
  // CI runs pull-request builds and may carry signing or notarization credentials: start from neither
  for (const name of [...PULL_REQUEST_ENV, ...NOTARIZATION_ENV]) {
    vi.stubEnv(name, undefined)
  }
  setPlatform("darwin")
  notarize.mockReset()
  vi.mocked(findIdentity).mockReset().mockResolvedValue(null)
  vi.mocked(verifyMacCodeSignature).mockReset().mockResolvedValue(null)
  vi.mocked(validateStapledTicket).mockReset().mockResolvedValue(null)
  vi.mocked(checkInstallerPackageSignature).mockReset().mockResolvedValue(null)
  // notarytool is found with /usr/bin/xcrun, which exists on macOS only
  vi.spyOn(Executables, "notarytool").mockResolvedValue("/Applications/Xcode.app/Contents/Developer/usr/bin/notarytool")
})

afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// just enough of a MacPackager for sign(), the build-start preflight and the prepackaged check; `forceCodeSigning`
// undefined keeps the real getter, which reads the `mac` block and then the root configuration
function makeMacPackager(macConfig: any, forceCodeSigning: boolean | undefined = true, options: any = {}): any {
  const packager = Object.create(MacPackager.prototype)
  packager.platform = Platform.MAC
  packager.platformSpecificBuildOptions = macConfig
  packager.info = { config: {}, options, getWorkspaceRoot: () => Promise.resolve("/project") }
  packager.appInfo = { type: "module", productFilename: "My" }
  packager.helper = new MacTargetHelper(packager)
  packager.codeSigningInfo = { value: Promise.resolve({ keychainFile: null }) }
  if (forceCodeSigning !== undefined) {
    Object.defineProperty(packager, "forceCodeSigning", { value: forceCodeSigning })
  }
  return packager
}

const errorOf = async (promise: Promise<unknown>): Promise<any> =>
  promise.then(
    () => null,
    (e: unknown) => e
  )

describe("notarizeIfProvided under forceCodeSigning", () => {
  test("fails without notarization credentials, naming the credential sets and the mac.notarize: false opt-out", async ({ expect }) => {
    const error = await errorOf(makeMacPackager({}).helper.notarizeIfProvided("/out/mac/My.app"))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("no notarization credentials are set")
    expect(error.message).toContain("APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER")
    expect(error.message).toContain("APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID")
    expect(error.message).toContain("APPLE_KEYCHAIN_PROFILE")
    expect(error.message).toContain("mac.notarize: false")
    expect(error.message).toContain(DOCS)
    expect(notarize).not.toHaveBeenCalled()
  })

  test("honors notarize: false, with a warning", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await makeMacPackager({ notarize: false }).helper.notarizeIfProvided("/out/mac/My.app")
    expect(notarize).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining("false") }), "skipped macOS notarization although forceCodeSigning is enabled")
  })

  test("validates the stapled ticket after notarizing", async ({ expect }) => {
    vi.stubEnv("APPLE_KEYCHAIN_PROFILE", "notary-profile")
    await makeMacPackager({}).helper.notarizeIfProvided("/out/mac/My.app")
    expect(notarize).toHaveBeenCalledWith(expect.objectContaining({ appPath: "/out/mac/My.app", keychainProfile: "notary-profile" }))
    expect(validateStapledTicket).toHaveBeenCalledWith("/out/mac/My.app")
  })

  test("fails when stapler validate rejects the ticket", async ({ expect }) => {
    vi.stubEnv("APPLE_KEYCHAIN_PROFILE", "notary-profile")
    vi.mocked(validateStapledTicket).mockResolvedValue("My.app does not have a ticket stapled to it.")
    const error = await errorOf(makeMacPackager({}).helper.notarizeIfProvided("/out/mac/My.app"))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.code).toBe("ERR_ELECTRON_BUILDER_VERIFICATION_FAILED")
    expect(error.message).toContain("stapler validate rejects its stapled ticket (My.app does not have a ticket stapled to it.)")
  })

  test("without forceCodeSigning, missing credentials still only warn and no ticket is validated", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await makeMacPackager({}, false).helper.notarizeIfProvided("/out/mac/My.app")
    expect(warn).toHaveBeenCalledWith(expect.anything(), "skipped macOS notarization")

    vi.stubEnv("APPLE_KEYCHAIN_PROFILE", "notary-profile")
    await makeMacPackager({}, false).helper.notarizeIfProvided("/out/mac/My.app")
    expect(notarize).toHaveBeenCalledTimes(1)
    expect(validateStapledTicket).not.toHaveBeenCalled()
  })
})

// notarize: true requires notarization; left unset, notarization runs when credentials are set and is skipped with a warning otherwise
describe("mac.notarize: true without forceCodeSigning", () => {
  const preflight = (packager: any, ...targetNames: Array<string>) =>
    (MacPackager.prototype as any).checkForceCodeSigningAtBuildStart.call(packager, [{ packager, arch: Arch.x64, targets: targetNames.map(name => ({ name })) }])

  test("fails at notarize time without notarization credentials, linking the migration page", async ({ expect }) => {
    const error = await errorOf(makeMacPackager({ notarize: true }, false).helper.notarizeIfProvided("/out/mac/My.app"))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("mac.notarize is true, which requires notarization, but no notarization credentials are set")
    expect(error.message).toContain("https://www.electron.build/docs/migration/v27-build-changes#mac-notarize-true-requires-credentials")
    expect(notarize).not.toHaveBeenCalled()
  })

  test("notarizes with credentials", async ({ expect }) => {
    vi.stubEnv("APPLE_KEYCHAIN_PROFILE", "notary-profile")
    await makeMacPackager({ notarize: true }, false).helper.notarizeIfProvided("/out/mac/My.app")
    expect(notarize).toHaveBeenCalledWith(expect.objectContaining({ keychainProfile: "notary-profile" }))
  })

  test("left unset, missing credentials still only warn", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await expect(makeMacPackager({}, false).helper.notarizeIfProvided("/out/mac/My.app")).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.anything(), "skipped macOS notarization")
  })

  test("fails at build start on a macOS host, where notarization can happen", ({ expect }) => {
    const packager = makeMacPackager({ notarize: true }, false)
    expect(() => preflight(packager, "dmg")).toThrow("mac.notarize is true, which requires notarization")
    // a MAS-only build is not notarized
    expect(() => preflight(packager, "mas")).not.toThrow()
    // left unset, nothing is required
    expect(() => preflight(makeMacPackager({}, false), "dmg")).not.toThrow()
    vi.stubEnv("APPLE_KEYCHAIN_PROFILE", "notary-profile")
    expect(() => preflight(packager, "dmg")).not.toThrow()
  })

  test("is not required when notarizing in a pull-request build, e.g. the pkg installer: it warns and skips, like the build-start check", async ({ expect }) => {
    vi.stubEnv("GITHUB_BASE_REF", "main")
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await expect(makeMacPackager({ notarize: true }, false).helper.notarizeIfProvided("/out/My-1.0.0.pkg")).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.anything(), "skipped macOS notarization")
    expect(notarize).not.toHaveBeenCalled()
  })

  test("is not required at build start when the configuration turns signing of the app off, unless a pkg is built", ({ expect }) => {
    for (const macConfig of [
      { notarize: true, sign: null },
      { notarize: true, sign: { identity: null } },
    ]) {
      const packager = makeMacPackager(macConfig, false)
      expect(() => preflight(packager, "dmg"), JSON.stringify(macConfig)).not.toThrow()
      expect(() => preflight(packager), JSON.stringify(macConfig)).not.toThrow()
      // the pkg installer is built, and notarized, whether the app is signed or not
      expect(() => preflight(packager, "pkg"), JSON.stringify(macConfig)).toThrow("mac.notarize is true, which requires notarization")
    }
    // identity auto-discovery turned off, without CSC_NAME, a configured identity or a custom signer
    vi.stubEnv("CSC_IDENTITY_AUTO_DISCOVERY", "false")
    vi.stubEnv("CSC_NAME", undefined)
    expect(() => preflight(makeMacPackager({ notarize: true }, false), "dmg")).not.toThrow()
    expect(() => preflight(makeMacPackager({ notarize: true, sign: { identity: "Foo Inc (TEAM123456)" } }, false), "dmg")).toThrow("mac.notarize is true")
    expect(() => preflight(makeMacPackager({ notarize: true, sign: vi.fn() }, false), "dmg")).toThrow("mac.notarize is true")
    vi.stubEnv("CSC_NAME", "Foo Inc (TEAM123456)")
    expect(() => preflight(makeMacPackager({ notarize: true }, false), "dmg")).toThrow("mac.notarize is true")
  })

  test("an incomplete credential set fails the build start only where the credentials are required", ({ expect }) => {
    vi.stubEnv("APPLE_ID", "me@example.com")
    // notarize unset, no forceCodeSigning: the credentials are not read at build start
    expect(() => preflight(makeMacPackager({}, false), "dmg")).not.toThrow()
    // notarize: true on another host, in a pull-request build, or with signing turned off
    setPlatform("linux")
    expect(() => preflight(makeMacPackager({ notarize: true }, false), "dmg")).not.toThrow()
    setPlatform("darwin")
    expect(() => preflight(makeMacPackager({ notarize: true, sign: null }, false), "dmg")).not.toThrow()
    vi.stubEnv("GITHUB_BASE_REF", "main")
    vi.spyOn(log, "warn").mockImplementation(() => undefined)
    expect(() => preflight(makeMacPackager({ notarize: true }, false), "dmg")).not.toThrow()
    vi.stubEnv("GITHUB_BASE_REF", undefined)
    // where they are required, the incomplete set is named
    expect(() => preflight(makeMacPackager({ notarize: true }, false), "dmg")).toThrow("APPLE_APP_SPECIFIC_PASSWORD env var needs to be set")
  })

  test("is not required at build start where the app cannot be signed (another host, a pull-request build)", ({ expect }) => {
    const packager = makeMacPackager({ notarize: true }, false)
    setPlatform("linux")
    expect(() => preflight(packager, "dmg")).not.toThrow()
    setPlatform("darwin")
    vi.stubEnv("GITHUB_BASE_REF", "main")
    vi.spyOn(log, "warn").mockImplementation(() => undefined)
    expect(() => preflight(packager, "dmg")).not.toThrow()
  })
})

describe("MacPackager.sign under forceCodeSigning", () => {
  const sign = (packager: any) => packager.sign("/out/mac/My.app", Arch.x64, "mac")

  test("fails on a host other than macOS instead of skipping signing", async ({ expect }) => {
    setPlatform("linux")
    const error = await errorOf(sign(makeMacPackager({})))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toMatch(/the mac app .*My\.app cannot be code signed or notarized on linux: macOS code signing needs a macOS host/)
    expect(error.message).toContain("-c.forceCodeSigning=false")
  })

  test("fails on a pull-request build, naming CSC_FOR_PULL_REQUEST and the override", async ({ expect }) => {
    vi.stubEnv("GITHUB_BASE_REF", "main")
    const error = await errorOf(sign(makeMacPackager({})))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("this is a pull-request build")
    expect(error.message).toContain("CSC_FOR_PULL_REQUEST=true")
    expect(error.message).toContain("-c.forceCodeSigning=false")
  })

  test("names the platform-level override when the mac block enables forceCodeSigning", async ({ expect }) => {
    setPlatform("linux")
    // the real getter: a platform-level value wins over the root one, so only -c.mac.forceCodeSigning=false overrides it
    await expect(sign(makeMacPackager({ forceCodeSigning: true }, undefined))).rejects.toThrow("-c.mac.forceCodeSigning=false")
  })

  test("CSC_FOR_PULL_REQUEST=true lets a pull-request build sign", async ({ expect }) => {
    vi.stubEnv("GITHUB_BASE_REF", "main")
    vi.stubEnv("CSC_FOR_PULL_REQUEST", "true")
    vi.spyOn(log, "warn").mockImplementation(() => undefined)
    // past the pull-request check, `sign: null` is the existing configuration error
    await expect(sign(makeMacPackager({ sign: null }))).rejects.toThrow("identity explicitly is set to null, but forceCodeSigning is set to true")
  })

  test("a custom signer without a keychain identity is called, and its signature is verified", async ({ expect }) => {
    vi.spyOn(log, "warn").mockImplementation(() => undefined)
    const customSign = vi.fn()
    const packager = makeMacPackager({ sign: customSign, notarize: false })
    packager.helper.buildSignOptions = vi.fn(() => Promise.resolve({ app: "/out/mac/My.app" }))
    packager.doSign = vi.fn(() => Promise.resolve())

    await expect(sign(packager)).resolves.toBe("signed:custom")
    expect(packager.doSign).toHaveBeenCalledWith({ app: "/out/mac/My.app" }, customSign, null)
    expect(verifyMacCodeSignature).toHaveBeenCalledWith("/out/mac/My.app", { deep: true })
  })

  test("fails when the custom signer leaves the app without a valid signature", async ({ expect }) => {
    vi.mocked(verifyMacCodeSignature).mockResolvedValue("code object is not signed at all")
    const packager = makeMacPackager({ sign: vi.fn(), notarize: false })
    packager.helper.buildSignOptions = vi.fn(() => Promise.resolve({ app: "/out/mac/My.app" }))
    packager.doSign = vi.fn(() => Promise.resolve())

    const error = await errorOf(sign(packager))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.code).toBe("ERR_ELECTRON_BUILDER_VERIFICATION_FAILED")
    expect(error.message).toMatch(
      /the custom mac\.sign signer left .*My\.app without a valid code signature \(codesign --verify --deep --strict: code object is not signed at all\)/
    )
  })

  test("without forceCodeSigning, a custom signer without a keychain identity is called too, saying so, and its output is not verified", async ({ expect }) => {
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
    const customSign = vi.fn()
    const packager = makeMacPackager({ sign: customSign, notarize: false }, false)
    packager.helper.buildSignOptions = vi.fn(() => Promise.resolve({ app: "/out/mac/My.app" }))
    packager.doSign = vi.fn(() => Promise.resolve())
    await expect(sign(packager)).resolves.toBe("signed:custom")
    expect(packager.doSign).toHaveBeenCalledWith({ app: "/out/mac/My.app" }, customSign, null)
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ reason: "no keychain identity was found" }), "calling the custom mac.sign signer without an identity")
    expect(verifyMacCodeSignature).not.toHaveBeenCalled()
  })

  test("without forceCodeSigning, a mas-dev app, which builds no installer, is signed by a custom signer without a keychain identity", async ({ expect }) => {
    vi.spyOn(log, "info").mockImplementation(() => undefined)
    const customSign = vi.fn()
    const packager = makeMacPackager({ sign: customSign }, false)
    packager.forceCodeSigningFor = () => false
    packager.helper.buildSignOptions = vi.fn(() => Promise.resolve({ app: "/out/mas-dev/My.app" }))
    packager.doSign = vi.fn(() => Promise.resolve())
    await expect(packager.sign("/out/mas-dev/My.app", Arch.x64, "mas-dev")).resolves.toBe("signed:custom")
    expect(packager.doSign).toHaveBeenCalledWith({ app: "/out/mas-dev/My.app" }, customSign, null)
  })

  test("without forceCodeSigning, a MAS app is not signed by a custom signer without a keychain identity, which warns", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    const packager = makeMacPackager({ sign: vi.fn() }, false)
    packager.forceCodeSigningFor = () => false
    packager.doSign = vi.fn(() => Promise.resolve())
    await expect(packager.sign("/out/mas/My.app", Arch.x64, "mas")).resolves.toBe("skipped:no-certificate")
    expect(packager.doSign).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringContaining("the MAS installer needs one") }),
      expect.stringContaining("is not called for the MAS app")
    )
  })
})

// mas and masDev cascade over mac like every other option, then the root value applies
describe("forceCodeSigning of the Mac App Store flavors", () => {
  // like makeMacPackager, but with the real forceCodeSigning getter and a root configuration
  function packagerWith(root: any, macConfig: any = {}): any {
    const packager = Object.create(MacPackager.prototype)
    packager.platform = Platform.MAC
    packager.platformSpecificBuildOptions = macConfig
    packager.info = { config: root, options: {}, getWorkspaceRoot: () => Promise.resolve("/project") }
    packager.appInfo = { type: "module", productFilename: "My" }
    packager.helper = new MacTargetHelper(packager)
    packager.codeSigningInfo = { value: Promise.resolve({ keychainFile: null }) }
    return packager
  }
  const signFlavor = (packager: any, platformType: string) => packager.sign("/out/mas/My.app", Arch.x64, platformType)
  const preflight = (packager: any, ...targetNames: Array<string>) =>
    (MacPackager.prototype as any).checkForceCodeSigningAtBuildStart.call(packager, [{ packager, arch: Arch.x64, targets: targetNames.map(name => ({ name })) }])

  test("mas.forceCodeSigning and masDev.forceCodeSigning apply to their flavors, and not to the macOS app", ({ expect }) => {
    const masOnly = packagerWith({ mas: { forceCodeSigning: true } })
    expect([masOnly.forceCodeSigningFor("mac"), masOnly.forceCodeSigningFor("mas"), masOnly.forceCodeSigningFor("mas-dev")]).toEqual([false, true, true])
    const masDevOnly = packagerWith({ masDev: { forceCodeSigning: true } })
    expect([masDevOnly.forceCodeSigningFor("mac"), masDevOnly.forceCodeSigningFor("mas"), masDevOnly.forceCodeSigningFor("mas-dev")]).toEqual([false, false, true])
    // mac and the root value cascade to the MAS flavors, unless mas turns it off
    expect(packagerWith({}, { forceCodeSigning: true }).forceCodeSigningFor("mas")).toBe(true)
    expect(packagerWith({ forceCodeSigning: true }).forceCodeSigningFor("mas-dev")).toBe(true)
    const masOff = packagerWith({ mas: { forceCodeSigning: false } }, { forceCodeSigning: true })
    expect([masOff.forceCodeSigningFor("mac"), masOff.forceCodeSigningFor("mas")]).toEqual([true, false])
  })

  test("signing a MAS app fails where it cannot sign, naming the mas override, while the macOS app is not forced", async ({ expect }) => {
    setPlatform("linux")
    const packager = packagerWith({ mas: { forceCodeSigning: true } })
    const error = await errorOf(signFlavor(packager, "mas"))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("-c.mas.forceCodeSigning=false")
    await expect(signFlavor(packager, "mac")).resolves.toBe("skipped:unsupported")
    expect((await errorOf(signFlavor(packagerWith({ masDev: { forceCodeSigning: true } }), "mas-dev"))).message).toContain("-c.masDev.forceCodeSigning=false")
    // mas: false turns off what mac enables, for the MAS app only
    await expect(signFlavor(packagerWith({ mas: { forceCodeSigning: false } }, { forceCodeSigning: true }), "mas")).resolves.toBe("skipped:unsupported")
  })

  test("the build-start preflight checks the flavors that are built, each with its own value", ({ expect }) => {
    setPlatform("linux")
    const masForced = packagerWith({ mas: { forceCodeSigning: true } })
    expect(() => preflight(masForced, "mas")).toThrow("-c.mas.forceCodeSigning=false")
    // the macOS app of this build is not forced, so a dmg-only build passes
    expect(() => preflight(masForced, "dmg")).not.toThrow()
    const macForcedMasOff = packagerWith({ mas: { forceCodeSigning: false } }, { forceCodeSigning: true, notarize: false })
    expect(() => preflight(macForcedMasOff, "mas")).not.toThrow()
    expect(() => preflight(macForcedMasOff, "dmg")).toThrow("macOS code signing needs a macOS host")
  })
})

describe("build-start preflight", () => {
  const preflight = (packager: any, plans: Array<any>) => (MacPackager.prototype as any).checkForceCodeSigningAtBuildStart.call(packager, plans)
  const planFor = (packager: any, ...targetNames: Array<string>) => [{ packager, arch: Arch.x64, targets: targetNames.map(name => ({ name })) }]

  test("fails on a host other than macOS, or on a pull-request build, before anything is packed", ({ expect }) => {
    const packager = makeMacPackager({ notarize: false })
    setPlatform("linux")
    expect(() => preflight(packager, planFor(packager, "dmg"))).toThrow("macOS code signing needs a macOS host")
    setPlatform("darwin")
    vi.stubEnv("GITHUB_BASE_REF", "main")
    expect(() => preflight(packager, planFor(packager, "dmg"))).toThrow("this is a pull-request build")
  })

  test("requires notarization credentials when the macOS app is packed, also for a dir build", ({ expect }) => {
    const packager = makeMacPackager({})
    expect(() => preflight(packager, planFor(packager, "dmg", "zip"))).toThrow("no notarization credentials are set")
    // a dir build plans no target, yet signs and notarizes the app
    expect(() => preflight(packager, planFor(packager))).toThrow("no notarization credentials are set")
  })

  test("requires none for a MAS-only build, with notarize: false, or for a prepackaged app without a pkg target", ({ expect }) => {
    const packager = makeMacPackager({})
    expect(() => preflight(packager, planFor(packager, "mas"))).not.toThrow()
    const optedOut = makeMacPackager({ notarize: false })
    expect(() => preflight(optedOut, planFor(optedOut, "dmg"))).not.toThrow()
    const prepackaged = makeMacPackager({}, true, { prepackaged: "/prepackaged/My.app" })
    expect(() => preflight(prepackaged, planFor(prepackaged, "dmg", "zip"))).not.toThrow()
  })

  test("requires them for a pkg target, which is notarized even for a prepackaged app", ({ expect }) => {
    const prepackaged = makeMacPackager({}, true, { prepackaged: "/prepackaged/My.app" })
    expect(() => preflight(prepackaged, planFor(prepackaged, "pkg"))).toThrow("no notarization credentials are set")
  })

  test("passes when notarization credentials are set, and fails on an incomplete set", ({ expect }) => {
    const packager = makeMacPackager({})
    vi.stubEnv("APPLE_KEYCHAIN_PROFILE", "notary-profile")
    expect(() => preflight(packager, planFor(packager, "dmg"))).not.toThrow()
    vi.stubEnv("APPLE_KEYCHAIN_PROFILE", undefined)
    vi.stubEnv("APPLE_ID", "me@example.com")
    expect(() => preflight(packager, planFor(packager, "dmg"))).toThrow("APPLE_APP_SPECIFIC_PASSWORD env var needs to be set")
  })

  test("ignores the plans of other packagers, and builds without forceCodeSigning", ({ expect }) => {
    setPlatform("linux")
    const packager = makeMacPackager({})
    expect(() => preflight(packager, planFor({}, "dmg"))).not.toThrow()
    const notForced = makeMacPackager({}, false)
    expect(() => preflight(notForced, planFor(notForced, "dmg"))).not.toThrow()
  })

  test.ifNotWindows("runs when the build starts, before the macOS app is packed", ({ expect }) => {
    const pack = vi.fn()
    return appThrows(
      expect,
      {
        targets: Platform.MAC.createTarget(DIR_TARGET, Arch.x64),
        config: { forceCodeSigning: true },
        platformPackagerFactory: info => {
          const packager = new MacPackager(info)
          packager.pack = pack
          return packager
        },
      },
      {},
      error => {
        // this host is either not macOS, or a macOS host without notarization credentials (see beforeEach)
        expect(error.message).toMatch(/macOS code signing needs a macOS host|no notarization credentials are set/)
        expect(pack).not.toHaveBeenCalled()
      }
    )
  })
})

describe("a prepackaged app under forceCodeSigning", () => {
  const verify = (packager: any) => (MacPackager.prototype as any).verifyPrepackagedApp.call(packager, "/prepackaged/My.app")

  test("must carry a valid code signature and a stapled notarization ticket", async ({ expect }) => {
    await verify(makeMacPackager({}))
    expect(verifyMacCodeSignature).toHaveBeenCalledWith("/prepackaged/My.app", { deep: true, strict: undefined })
    expect(validateStapledTicket).toHaveBeenCalledWith("/prepackaged/My.app")
  })

  test("fails when it is not signed, or not notarized", async ({ expect }) => {
    vi.mocked(verifyMacCodeSignature).mockResolvedValueOnce("code object is not signed at all")
    await expect(verify(makeMacPackager({}))).rejects.toThrow(/the prepackaged app .*My\.app has no valid code signature/)
    vi.mocked(validateStapledTicket).mockResolvedValueOnce("My.app does not have a ticket stapled to it.")
    await expect(verify(makeMacPackager({}))).rejects.toThrow(/has no valid stapled notarization ticket.*or set mac\.notarize: false/)
  })

  test("honors mac.sign.strictVerify, and notarize: false with a warning", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
    await verify(makeMacPackager({ sign: { strictVerify: false }, notarize: false }))
    expect(verifyMacCodeSignature).toHaveBeenCalledWith("/prepackaged/My.app", { deep: true, strict: false })
    expect(validateStapledTicket).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.anything(), "the notarization of the prepackaged app is not verified although forceCodeSigning is enabled")
  })

  test("needs a macOS host", async ({ expect }) => {
    setPlatform("win32")
    await expect(verify(makeMacPackager({}))).rejects.toThrow("macOS code signing needs a macOS host")
  })
})

describe("the MAS installer under forceCodeSigning", () => {
  function makeInstallerPackager(forceCodeSigning: boolean): any {
    const packager = makeMacPackager({}, forceCodeSigning)
    // the MAS installer follows the forceCodeSigning of its flavor
    packager.forceCodeSigningFor = (platformType: string) => platformType === "mas" && forceCodeSigning
    packager.expandArtifactNamePattern = () => "My-1.0.0.pkg"
    packager.doFlat = vi.fn(() => Promise.resolve())
    packager.emitArtifactBuildCompleted = vi.fn(() => Promise.resolve())
    packager.computeSafeArtifactName = () => null
    return packager
  }

  test("is checked with pkgutil after it is built", async ({ expect, tmpDir }) => {
    vi.mocked(findIdentity).mockResolvedValue({ name: "3rd Party Mac Developer Installer: Foo (TEAM123456)", hash: "ABC" })
    const outDir = await tmpDir.createTempDir()
    const packager = makeInstallerPackager(true)
    vi.mocked(checkInstallerPackageSignature).mockResolvedValue("pkgutil --check-signature: no signature")
    await expect(packager.helper.createMasInstaller("/out/mas/My.app", outDir, {}, null, "mas", Arch.x64)).rejects.toThrow(
      /the installer package .*My-1\.0\.0\.pkg is not validly signed \(pkgutil --check-signature: no signature\)/
    )
    expect(packager.emitArtifactBuildCompleted).not.toHaveBeenCalled()

    vi.mocked(checkInstallerPackageSignature).mockResolvedValue(null)
    await packager.helper.createMasInstaller("/out/mas/My.app", outDir, {}, null, "mas", Arch.x64)
    expect(packager.emitArtifactBuildCompleted).toHaveBeenCalledTimes(1)
  })

  test("is not checked without forceCodeSigning", async ({ expect, tmpDir }) => {
    vi.mocked(findIdentity).mockResolvedValue({ name: "3rd Party Mac Developer Installer: Foo (TEAM123456)", hash: "ABC" })
    const packager = makeInstallerPackager(false)
    await packager.helper.createMasInstaller("/out/mas/My.app", await tmpDir.createTempDir(), {}, null, "mas", Arch.x64)
    expect(checkInstallerPackageSignature).not.toHaveBeenCalled()
  })
})
