import { GenericServerOptions } from "builder-util-runtime"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createNsisUpdater, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// NsisUpdater.verifySignature guard: app-update.yml without publisherName used to skip
// verification (including custom verifyUpdateCodeSignature hooks) completely silently.
// It must now warn about the deprecated fail-open behavior; the no-app-update.yml (dev
// mode) path must stay silent.

const DEPRECATION_FRAGMENT = "fail-open behavior is deprecated"

function mockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}

describe("NsisUpdater verifySignature publisherName guard", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("warns and skips verification when app-update.yml has no publisherName", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: "https://example.com/updates",
    })
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn()
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    const result = await updater.verifySignature("/path/to/installer.exe")

    expect(result).toEqual({ response: "success" })
    // the custom hook is also skipped by the guard — that is exactly what the warning is about
    expect(verifyHook).not.toHaveBeenCalled()
    const warnings = logger.warn.mock.calls.map(call => String(call[0]))
    const deprecationWarnings = warnings.filter(message => message.includes(DEPRECATION_FRAGMENT))
    expect(deprecationWarnings).toHaveLength(1)
    expect(deprecationWarnings[0]).toContain("win.sign.publisherName")
    expect(deprecationWarnings[0]).toContain("app-update.yml")
    expect(deprecationWarnings[0]).toContain("electron-builder v28")
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
    expect(logger.warn.mock.calls.map(call => String(call[0])).filter(message => message.includes(DEPRECATION_FRAGMENT))).toHaveLength(0)
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

  test("stays silent when app-update.yml does not exist at all (dev mode)", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = "/nonexistent/dir/app-update.yml"
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn()
    updater.verifyUpdateFileAuthenticodeSignature = verifyHook

    // @ts-expect-error accessing a private method
    const result = await updater.verifySignature("/path/to/installer.exe")

    expect(result).toEqual({ response: "success" })
    expect(verifyHook).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
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

      // Assert the CALL COUNT after each hop, not just toHaveBeenCalledWith. Two reasons: toHaveBeenCalledWith
      // matches any recorded call, so repeating it proves nothing after the first hop; and off Windows the built-in
      // verifier this shim delegates to fails open (no powershell.exe -> `{ response: "success" }`, i.e. `null`
      // through the legacy shim), which is exactly what every assertion below expects. Without the counts, a
      // completely non-delegating implementation would pass this test on macOS and Linux.
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
      // check to prove it ran at all. Off Windows the built-in verifier fails open to these very same values
      // (`{ response: "success" }` / `null`), so without the counts neither hook has to be reached for this to pass.
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
