import { GenericServerOptions } from "builder-util-runtime"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createNsisUpdater, writeRawUpdateConfig, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// NsisUpdater.verifySignature guard: an app-update.yml without publisherName used to skip verification (including custom
// verifyUpdateCodeSignature hooks), first silently, then with a deprecation warning. Since electron-updater 7 it fails closed:
// the update is rejected unless the config opts out explicitly with `verifyUpdateCodeSignature: false` (written by electron-builder
// for win.verifyUpdateCodeSignature: false). An app without any update config file (dev mode, or a feed set only with setFeedURL)
// is not verified, as before: its feed is configured by the developer.

const MISSING_DOCS = "https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification"
const DISABLED_FRAGMENT = "disabled by configuration"

function mockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}

const messages = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map(call => String(call[0]))

describe("NsisUpdater verifySignature publisherName guard", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("rejects the update when app-update.yml has no publisherName, without calling the verifier", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeRawUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: "https://example.com/updates",
    })
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn(async () => ({ response: "success" as const }))
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    const result = await updater.verifySignature("/path/to/installer.exe")

    expect(result.response).toBe("failure")
    const message = result.response === "failure" ? result.message : ""
    expect(message).toContain("The update is rejected: app-update.yml has no publisherName")
    expect(message).toContain("win.sign.publisherName")
    expect(message).toContain("win.verifyUpdateCodeSignature: false")
    expect(message.endsWith(MISSING_DOCS)).toBe(true)
    // a custom verifier gets no publisher names to match, so it is not asked
    expect(verifyHook).not.toHaveBeenCalled()
    expect(messages(logger.warn).filter(it => it.includes(DISABLED_FRAGMENT))).toHaveLength(0)
  })

  test.each([
    ["publisherName: null", { publisherName: null }],
    ["an empty publisherName list", { publisherName: [] }],
    ["a publisherName without a string entry", { publisherName: [42] }],
    ["verifyUpdateCodeSignature: true", { verifyUpdateCodeSignature: true }],
    ['verifyUpdateCodeSignature: "false"', { verifyUpdateCodeSignature: "false" }],
  ])("rejects the update for %s", async (_name, extra) => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeRawUpdateConfig({ provider: "generic", url: "https://example.com/updates", ...extra } as GenericServerOptions)
    updater.logger = mockLogger()
    const verifyHook = vi.fn(async () => ({ response: "success" as const }))
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    const result = await updater.verifySignature("/path/to/installer.exe")

    expect(result).toEqual({ response: "failure", message: expect.stringContaining("app-update.yml has no publisherName") })
    expect(verifyHook).not.toHaveBeenCalled()
  })

  test("skips verification with one warning per updater when app-update.yml opts out with verifyUpdateCodeSignature: false", async () => {
    const config = { provider: "generic", url: "https://example.com/updates", verifyUpdateCodeSignature: false } as GenericServerOptions
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeRawUpdateConfig(config)
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn(async () => ({ response: "failure" as const, message: "must not be called" }))
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    await expect(updater.verifySignature("/path/to/installer.exe")).resolves.toEqual({ response: "success" })
    // @ts-expect-error accessing a private method
    await expect(updater.verifySignature("/path/to/installer.exe")).resolves.toEqual({ response: "success" })

    expect(verifyHook).not.toHaveBeenCalled()
    const warnings = messages(logger.warn).filter(it => it.includes(DISABLED_FRAGMENT))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("verifyUpdateCodeSignature: false")

    // per instance: another updater announces it again
    const other = await createNsisUpdater()
    other.updateConfigPath = await writeRawUpdateConfig(config)
    const otherLogger = mockLogger()
    other.logger = otherLogger
    // @ts-expect-error accessing a private method
    await other.verifySignature("/path/to/installer.exe")
    expect(messages(otherLogger.warn).filter(it => it.includes(DISABLED_FRAGMENT))).toHaveLength(1)
  })

  test("a publisherName wins over the opt-out marker: the update is verified", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeRawUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: "https://example.com/updates",
      publisherName: ["CN=Acme Corp"],
      verifyUpdateCodeSignature: false,
    })
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn(async () => ({ response: "failure" as const, message: "wrong signer" }))
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    await expect(updater.verifySignature("/path/to/installer.exe")).resolves.toEqual({ response: "failure", message: "wrong signer" })
    expect(verifyHook).toHaveBeenCalledWith(["CN=Acme Corp"], "/path/to/installer.exe")
    expect(messages(logger.warn).filter(it => it.includes(DISABLED_FRAGMENT))).toHaveLength(0)
  })

  // no update config file at all: skipped silently, exactly as before electron-updater 7
  for (const isPackaged of [true, false]) {
    const what = isPackaged ? "a packaged app without app-update.yml (a feed set only with setFeedURL)" : "an unpackaged app (dev mode) without dev-app-update.yml"
    test(`${what} is not verified, as before, without calling the verifier or logging`, async () => {
      const updater = await createNsisUpdater()
      // @ts-expect-error accessing the protected app adapter
      vi.spyOn(updater.app, "isPackaged", "get").mockReturnValue(isPackaged)
      updater.setFeedURL({ provider: "generic", url: "https://example.com/updates" })
      updater.updateConfigPath = isPackaged ? "/nonexistent/dir/app-update.yml" : "/nonexistent/dir/dev-app-update.yml"
      const logger = mockLogger()
      updater.logger = logger
      const verifyHook = vi.fn(async () => ({ response: "failure" as const, message: "must not be called" }))
      updater.verifyUpdateFileAuthenticodeSignature = verifyHook

      // @ts-expect-error accessing a private method
      await expect(updater.verifySignature("/path/to/installer.exe")).resolves.toEqual({ response: "success" })
      // @ts-expect-error accessing a private method
      await expect(updater.verifySignature("/path/to/installer.exe")).resolves.toEqual({ response: "success" })

      expect(verifyHook).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  }

  test("an unpackaged app (dev mode) with a dev-app-update.yml without publisherName is rejected too", async () => {
    const updater = await createNsisUpdater()
    // @ts-expect-error accessing the protected app adapter
    vi.spyOn(updater.app, "isPackaged", "get").mockReturnValue(false)
    updater.updateConfigPath = await writeRawUpdateConfig<GenericServerOptions>({ provider: "generic", url: "https://example.com/updates" })
    updater.logger = mockLogger()

    // @ts-expect-error accessing a private method
    await expect(updater.verifySignature("/path/to/installer.exe")).resolves.toEqual({ response: "failure", message: expect.stringContaining("dev-app-update.yml") })
  })

  test("does not warn and runs the verifier when publisherName is present", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: "https://example.com/updates",
      publisherName: ["Acme Corp"],
    })
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn().mockResolvedValue({ response: "success" })
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    const result = await updater.verifySignature("/path/to/installer.exe")

    expect(result).toEqual({ response: "success" })
    expect(verifyHook).toHaveBeenCalledTimes(1)
    expect(verifyHook).toHaveBeenCalledWith(["Acme Corp"], "/path/to/installer.exe")
    expect(messages(logger.warn).filter(message => message.includes(DISABLED_FRAGMENT))).toHaveLength(0)
  })

  test("normalizes a single string publisherName to an array for the verifier", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: "https://example.com/updates",
      publisherName: "Acme Corp" as any,
    })
    updater.logger = mockLogger()
    const verifyHook = vi.fn().mockResolvedValue({ response: "success" })
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    await updater.verifySignature("/path/to/installer.exe")

    expect(verifyHook).toHaveBeenCalledWith(["Acme Corp"], "/path/to/installer.exe")
  })

  // electron-updater 7 matches a publisherName only when it is a distinguished name. An app-update.yml written by electron-builder v26
  // (the certificate's CN), a dev-app-update.yml or a publisherName passed to the verifier may still carry other entries.
  describe("default verifier: publisherName that is not a distinguished name", () => {
    const DN_WARNING = "electron-updater 7 (electron-builder v27)"
    const DOCS = "https://www.electron.build/docs/migration/v27-build-changes#windows-publishername-must-be-a-distinguished-name"
    const dnWarnings = (logger: ReturnType<typeof mockLogger>) => logger.warn.mock.calls.map(call => String(call[0])).filter(message => message.includes(DN_WARNING))
    // The real verifier runs after the warning: on Windows Get-AuthenticodeSignature fails for the missing file, elsewhere there is no
    // PowerShell. The outcome is not what these tests are about.
    const settle = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        () => undefined
      )

    test("warns once per updater instance, naming the entries, the requirement and the migration guide, without the feed's secrets", { timeout: 120_000 }, async () => {
      const config = {
        provider: "generic",
        url: "https://example.com/updates?token=feed-secret",
        publisherName: ["My Company", "Other Company", "CN=My Company"],
      } as GenericServerOptions
      const updater = await createNsisUpdater()
      updater.updateConfigPath = await writeUpdateConfig(config)
      const logger = mockLogger()
      updater.logger = logger

      // @ts-expect-error accessing a private method
      await settle(updater.verifySignature("/path/to/installer.exe"))
      // @ts-expect-error accessing a private method
      await settle(updater.verifySignature("/path/to/installer.exe"))

      const warnings = dnWarnings(logger)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('publisherName "My Company", "Other Company" can never match the signer of an update')
      expect(warnings[0]).toContain('only when it is in distinguished name (DN) format, e.g. "CN=My Company, O=My Company, C=US"')
      expect(warnings[0]).toContain("dev-app-update.yml (or the updateConfigPath file)")
      expect(warnings[0].endsWith(DOCS)).toBe(true)
      expect(warnings[0]).not.toContain("feed-secret")

      // per instance: another updater announces it again
      const other = await createNsisUpdater()
      other.updateConfigPath = await writeUpdateConfig(config)
      const otherLogger = mockLogger()
      other.logger = otherLogger
      // @ts-expect-error accessing a private method
      await settle(other.verifySignature("/path/to/installer.exe"))
      expect(dnWarnings(otherLogger)).toHaveLength(1)
    })

    test("covers a publisherName passed to the default verifier directly (runtime configuration)", { timeout: 120_000 }, async () => {
      const updater = await createNsisUpdater()
      const logger = mockLogger()
      updater.logger = logger

      await settle(updater.verifyUpdateFileAuthenticodeSignature(["Acme Corp"], "/path/to/installer.exe"))
      await settle(updater.verifyUpdateFileAuthenticodeSignature(["Other Corp"], "/path/to/installer.exe"))

      const warnings = dnWarnings(logger)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('publisherName "Acme Corp" can never match')
    })

    test("does not warn for DNs (a CN-only one included), nor for a custom verifier", { timeout: 120_000 }, async () => {
      const updater = await createNsisUpdater()
      const logger = mockLogger()
      updater.logger = logger
      await settle(updater.verifyUpdateFileAuthenticodeSignature(["CN=Acme Corp, O=Acme Corp, C=US", "CN=Old Corp"], "/path/to/installer.exe"))
      expect(dnWarnings(logger)).toHaveLength(0)

      updater.verifyUpdateFileAuthenticodeSignature = vi.fn(async () => ({ response: "success" as const }))
      await updater.verifyUpdateFileAuthenticodeSignature(["Acme Corp"], "/path/to/installer.exe")
      expect(dnWarnings(logger)).toHaveLength(0)
    })
  })

  describe("legacy verifyUpdateCodeSignature", () => {
    test("setter and getter delegate to verifyUpdateFileAuthenticodeSignature with backwards-compatible interface", async () => {
      const updater = await createNsisUpdater()
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
        provider: "generic",
        url: "https://example.com/updates",
        publisherName: ["Acme Corp"],
      })
      updater.logger = mockLogger()

      // Using the legacy setter to set the new verifyUpdateFileAuthenticodeSignature hook
      const verifyHook = vi.fn().mockResolvedValue(null) // success as per old interface
      updater.verifyUpdateCodeSignature = verifyHook

      // Assert the CALL COUNT after each hop, not just toHaveBeenCalledWith: toHaveBeenCalledWith matches any
      // recorded call, so repeating it proves nothing after the first hop. (Before v27 the built-in verifier also
      // failed open off Windows to exactly the values asserted below; it now rejects when PowerShell cannot run.)
      // @ts-expect-error accessing a private method
      const innerMethodResult = await updater.verifySignature("/path/to/installer.exe")
      expect(innerMethodResult).toEqual({ response: "success" }) // private method uses new interface internally
      expect(verifyHook).toHaveBeenCalledTimes(1)
      expect(verifyHook).toHaveBeenNthCalledWith(1, ["Acme Corp"], "/path/to/installer.exe")

      const newGetterMethodResult = await updater.verifyUpdateFileAuthenticodeSignature(["Acme Corp"], "/path/to/installer.exe")
      expect(newGetterMethodResult).toEqual({ response: "success" }) // new method uses new interface internally
      expect(verifyHook).toHaveBeenCalledTimes(2)
      expect(verifyHook).toHaveBeenNthCalledWith(2, ["Acme Corp"], "/path/to/installer.exe")

      const legacyGetterMethodResult = await updater.verifyUpdateCodeSignature(["Acme Corp"], "/path/to/installer.exe")
      expect(legacyGetterMethodResult).toBe(null) // legacy getter method still returns the old interface
      expect(verifyHook).toHaveBeenCalledTimes(3)
      expect(verifyHook).toHaveBeenNthCalledWith(3, ["Acme Corp"], "/path/to/installer.exe")
    })

    test("handles failure cases with backwards-compatible interface", async () => {
      const updater = await createNsisUpdater()
      updater.logger = mockLogger()
      const message = "custom verification failed"
      const verifyHook = vi.fn().mockResolvedValue(message) // error as per old interface
      updater.verifyUpdateCodeSignature = verifyHook

      const newGetterMethodResult = await updater.verifyUpdateFileAuthenticodeSignature(["Acme Corp"], "/path/to/installer.exe")
      expect(newGetterMethodResult).toEqual({ response: "failure", message })

      const legacyGetterMethodResult = await updater.verifyUpdateCodeSignature(["Acme Corp"], "/path/to/installer.exe")
      expect(legacyGetterMethodResult).toBe(message)
    })

    test("fails closed instead of throwing when the underlying verifier returns a malformed result", async () => {
      const updater = await createNsisUpdater()
      updater.logger = mockLogger()
      // @ts-expect-error intentionally violating the verifier contract to cover fail-closed behavior
      updater.verifyUpdateFileAuthenticodeSignature = vi.fn(async () => null)

      // the legacy contract is `string | null`, so a contract violation must surface as an error message, not a TypeError
      await expect(updater.verifyUpdateCodeSignature(["Acme Corp"], "/path/to/installer.exe")).resolves.toBe("unknown error")
    })

    test("reports a reason when the underlying verifier fails without a message", async () => {
      const updater = await createNsisUpdater()
      updater.logger = mockLogger()
      // @ts-expect-error intentionally violating the verifier contract to cover fail-closed behavior
      updater.verifyUpdateFileAuthenticodeSignature = vi.fn(async () => ({ response: "failure" }))

      // an empty message would be falsy, and legacy consumers read falsy as "verified"
      await expect(updater.verifyUpdateCodeSignature(["Acme Corp"], "/path/to/installer.exe")).resolves.toBe("unknown error")
    })

    test("getter is stable across reads and tracks the current verifier", async () => {
      const updater = await createNsisUpdater()
      updater.logger = mockLogger()

      expect(updater.verifyUpdateCodeSignature).toBe(updater.verifyUpdateCodeSignature)

      const before = updater.verifyUpdateCodeSignature
      updater.verifyUpdateFileAuthenticodeSignature = vi.fn(async () => ({ response: "failure" as const, message: "nope" }))
      expect(updater.verifyUpdateCodeSignature).not.toBe(before)
      await expect(updater.verifyUpdateCodeSignature(["Acme Corp"], "/path/to/installer.exe")).resolves.toBe("nope")
    })

    test("assigning null restores the default verifier", async () => {
      const updater = await createNsisUpdater()
      updater.logger = mockLogger()
      const custom = vi.fn(async () => ({ response: "success" as const }))
      updater.verifyUpdateFileAuthenticodeSignature = custom
      expect(updater.verifyUpdateFileAuthenticodeSignature).toBe(custom)

      updater.verifyUpdateFileAuthenticodeSignature = null
      expect(updater.verifyUpdateFileAuthenticodeSignature).not.toBe(custom)
    })

    test("the deprecated protected _verifyUpdateCodeSignature field still reaches the verifier", async () => {
      const updater = await createNsisUpdater()
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
        provider: "generic",
        url: "https://example.com/updates",
        publisherName: ["Acme Corp"],
      })
      updater.logger = mockLogger()
      const nativeVerifier = vi.fn(async () => ({ response: "failure" as const, message: "from the protected field" }))
      // @ts-expect-error assigning the deprecated protected member the way a subclass would
      updater._verifyUpdateCodeSignature = nativeVerifier

      // @ts-expect-error accessing a private method
      await expect(updater.verifySignature("/path/to/installer.exe")).resolves.toEqual({ response: "failure", message: "from the protected field" })
      expect(nativeVerifier).toHaveBeenCalledWith(["Acme Corp"], "/path/to/installer.exe")
    })

    test("preserves updater this-binding in both directions", async () => {
      const updater = await createNsisUpdater()
      updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
        provider: "generic",
        url: "https://example.com/updates",
        publisherName: ["Acme Corp"],
      })

      // The real assertion — expect(this).toBe(updater) — lives inside each hook, so each one needs a call-count
      // check to prove it ran at all.
      const newStyleHook = vi.fn(async function (this: typeof updater) {
        expect(this).toBe(updater)
        return { response: "success" as const }
      })
      updater.verifyUpdateFileAuthenticodeSignature = newStyleHook
      await expect(updater.verifyUpdateCodeSignature(["Acme Corp"], "/path/to/installer.exe")).resolves.toBeNull()
      expect(newStyleHook).toHaveBeenCalledTimes(1)

      const legacyHook = vi.fn(async function (this: typeof updater) {
        expect(this).toBe(updater)
        return null
      })
      updater.verifyUpdateCodeSignature = legacyHook

      // @ts-expect-error accessing a private method
      const innerMethodResult = await updater.verifySignature("/path/to/installer.exe")
      expect(innerMethodResult).toEqual({ response: "success" })
      expect(legacyHook).toHaveBeenCalledTimes(1)
    })
  })
})
