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
    updater.verifyUpdateCodeSignature = verifyHook

    const result = await (updater as any).verifySignature("/path/to/installer.exe")

    expect(result).toBeNull()
    // the custom hook is also skipped by the guard — that is exactly what the warning is about
    expect(verifyHook).not.toHaveBeenCalled()
    const warnings = logger.warn.mock.calls.map(call => String(call[0]))
    const deprecationWarnings = warnings.filter(message => message.includes(DEPRECATION_FRAGMENT))
    expect(deprecationWarnings).toHaveLength(1)
    expect(deprecationWarnings[0]).toContain("publisherName")
    expect(deprecationWarnings[0]).toContain("app-update.yml")
    expect(deprecationWarnings[0]).toContain("electron-builder v28")
  })

  test("does not warn and runs the verifier when publisherName is present", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({
      provider: "generic",
      url: "https://example.com/updates",
      publisherName: ["Acme Corp"],
    } as GenericServerOptions)
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn().mockResolvedValue(null)
    updater.verifyUpdateCodeSignature = verifyHook

    const result = await (updater as any).verifySignature("/path/to/installer.exe")

    expect(result).toBeNull()
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
    } as GenericServerOptions)
    updater.logger = mockLogger()
    const verifyHook = vi.fn().mockResolvedValue(null)
    updater.verifyUpdateCodeSignature = verifyHook

    await (updater as any).verifySignature("/path/to/installer.exe")

    expect(verifyHook).toHaveBeenCalledWith(["Acme Corp"], "/path/to/installer.exe")
  })

  test("stays silent when app-update.yml does not exist at all (dev mode)", async () => {
    const updater = await createNsisUpdater()
    updater.updateConfigPath = "/nonexistent/dir/app-update.yml"
    const logger = mockLogger()
    updater.logger = logger
    const verifyHook = vi.fn()
    updater.verifyUpdateCodeSignature = verifyHook

    const result = await (updater as any).verifySignature("/path/to/installer.exe")

    expect(result).toBeNull()
    expect(verifyHook).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
