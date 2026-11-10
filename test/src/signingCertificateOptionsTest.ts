import { MacPackager, WinPackager } from "app-builder-lib"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// MacPackager and WinPackager read their certificate options from the platform options only. A hand-rolled `this` with those options is
// enough; its root config holds the v26 root keys, which must never be read.
function packagerThis(platformOptions: Record<string, any>): any {
  return { platformSpecificBuildOptions: platformOptions, info: { config: { cscLink: "root.p12", cscKeyPassword: "root-password" } } }
}

const macCscLink = (platformOptions: Record<string, any>): unknown => MacPackager.prototype.getCscLink.call(packagerThis(platformOptions))
const macPassword = (platformOptions: Record<string, any>): unknown => (MacPackager.prototype as any).doGetCscPassword.call(packagerThis(platformOptions))
const winCscLink = (platformOptions: Record<string, any>): unknown => WinPackager.prototype.getCscLink.call(packagerThis(platformOptions), "WIN_CSC_LINK")
const winPassword = (platformOptions: Record<string, any>): unknown => (WinPackager.prototype as any).doGetCscPassword.call(packagerThis(platformOptions))

describe("signing certificate options", () => {
  beforeEach(() => {
    for (const name of ["CSC_LINK", "CSC_KEY_PASSWORD", "WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"]) {
      vi.stubEnv(name, undefined)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("macOS: mac.cscLink / mac.cscKeyPassword, then CSC_LINK / CSC_KEY_PASSWORD", () => {
    vi.stubEnv("CSC_LINK", "env.p12")
    vi.stubEnv("CSC_KEY_PASSWORD", "env-password")
    expect(macCscLink({ cscLink: "mac.p12" })).toBe("mac.p12")
    expect(macPassword({ cscKeyPassword: "mac-password" })).toBe("mac-password")
    expect(macCscLink({})).toBe("env.p12")
    expect(macPassword({})).toBe("env-password")
  })

  test("macOS: without a mac option or environment variable, there is no certificate (the root config is not read)", () => {
    expect(macCscLink({})).toBeUndefined()
    expect(macPassword({})).toBeUndefined()
  })

  test("Windows certificate: win.cscLink, then WIN_CSC_LINK, then CSC_LINK", () => {
    vi.stubEnv("CSC_LINK", "env.p12")
    expect(winCscLink({})).toBe("env.p12")
    vi.stubEnv("WIN_CSC_LINK", "win-env.pfx")
    expect(winCscLink({})).toBe("win-env.pfx")
    expect(winCscLink({ cscLink: "win.pfx" })).toBe("win.pfx")
  })

  test("Windows password: win.sign.certificatePassword, then WIN_CSC_KEY_PASSWORD, win.cscKeyPassword, CSC_KEY_PASSWORD", () => {
    expect(winPassword({})).toBeUndefined()
    vi.stubEnv("CSC_KEY_PASSWORD", "env-password")
    expect(winPassword({})).toBe("env-password")
    expect(winPassword({ cscKeyPassword: "win-password" })).toBe("win-password")
    vi.stubEnv("WIN_CSC_KEY_PASSWORD", "win-env-password")
    expect(winPassword({ cscKeyPassword: "win-password" })).toBe("win-env-password")
    expect(winPassword({ cscKeyPassword: "win-password", sign: { type: "signtool", certificatePassword: "sign-password" } })).toBe("sign-password")
  })
})
