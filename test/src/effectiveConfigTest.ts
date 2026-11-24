import fsExtra from "fs-extra"
import * as path from "path"
import { DebugLogger, log } from "builder-util"
import { afterEach, describe, test, vi } from "vitest"
import { app, linuxDirTarget } from "./helpers/packTester.js"
import { Configuration } from "electron-builder"
import { safeStringifyConfig, validateConfiguration } from "app-builder-lib/src/util/config/config"

const effectiveConfigFile = (outDir: string) => path.join(outDir, "builder-effective-config.yaml")

// what hashSensitiveValue writes for a masked string
const FINGERPRINT = /^[0-9a-f]{32} \(redacted fingerprint\)$/

afterEach(() => {
  vi.restoreAllMocks()
})

test("writeEffectiveConfig: true writes the file outside a TTY", ({ expect }) =>
  app(
    expect,
    { targets: linuxDirTarget, config: { writeEffectiveConfig: true } },
    {
      packed: async context => {
        const content = await fsExtra.readFile(effectiveConfigFile(context.outDir), "utf8")
        expect(content).toMatch(/^electronVersion: /m)
      },
    }
  ))

test("writeEffectiveConfig: false skips the file", ({ expect }) =>
  app(
    expect,
    { targets: linuxDirTarget, config: { writeEffectiveConfig: false } },
    {
      packed: async context => {
        expect(await fsExtra.pathExists(effectiveConfigFile(context.outDir))).toBe(false)
      },
    }
  ))

test("the effective config and its debug log mask certificate links, the PKCS#11 key URI and URL credentials", ({ expect }) => {
  const debug = vi.spyOn(log, "debug")
  const config: Configuration = {
    writeEffectiveConfig: true,
    cscLink: "ROOT_CSC_LINK_SECRET",
    mac: { cscLink: "MAC_CSC_LINK_SECRET", cscInstallerLink: "MAC_INSTALLER_LINK_SECRET" },
    win: {
      cscLink: "WIN_CSC_LINK_SECRET",
      sign: { type: "pkcs11", pkcs11Module: "/usr/lib/opensc-pkcs11.so", pkcs11KeyUri: "pkcs11:token=MyToken;object=MyKey?pin-value=PKCS11_PIN_SECRET" },
    },
    snapcraft: { base: "core24", cscLink: "SNAP_STORE_LOGIN_SECRET" },
    nsisWeb: { appPackageUrl: "https://web-user:WEB_PASSWORD_SECRET@example.com/packages" },
    publish: { provider: "generic", url: "https://feed-user:FEED_P@SSWORD_SECRET@example.com/updates?token=FEED_TOKEN_SECRET" },
    // user info inside a longer value, and without a scheme
    npmArgs: ["--registry=https://npm-user:NPM_PASSWORD_SECRET@registry.example.com/", "--proxy=//proxy-user:PROXY_PASSWORD_SECRET@proxy.example.com:8080"],
  }
  return app(
    expect,
    { targets: linuxDirTarget, config },
    {
      packed: async context => {
        const effectiveConfigLog = debug.mock.calls.find(([, message]) => message === "effective config")
        for (const content of [await fsExtra.readFile(effectiveConfigFile(context.outDir), "utf8"), String((effectiveConfigLog?.[0] as any)?.config)]) {
          expect(content).not.toMatch(/SECRET/)
          expect(content).toMatch(/^cscLink: .*\(redacted fingerprint\)/m)
          expect(content).toMatch(/cscInstallerLink: .*\(redacted fingerprint\)/)
          expect(content).toMatch(/pkcs11KeyUri: .*\(redacted fingerprint\)/)
          expect(content).toContain("https://<redacted>@example.com/updates?token=<redacted>")
          expect(content).toContain("https://<redacted>@example.com/packages")
          expect(content).toContain("--registry=https://<redacted>@registry.example.com/")
          expect(content).toContain("--proxy=//<redacted>@proxy.example.com:8080")
          // a URL without credentials (the fixture's squirrelWindows.iconUrl) is written as it is
          expect(content).toContain("https://raw.githubusercontent.com/szwacz/electron-boilerplate/master/resources/windows/icon.ico")
        }
      },
    }
  )
})

describe("safeStringifyConfig", () => {
  const stringified = (value: string): string => JSON.parse(safeStringifyConfig({ value })).value

  test.for([
    ["user info", "https://user:PASSWORD_SECRET@example.com/updates", "https://<redacted>@example.com/updates"],
    ["user info with an @ in the password", "https://user:P@SSWORD_SECRET@example.com/", "https://<redacted>@example.com/"],
    ["a user name alone (a token)", "https://TOKEN_SECRET@github.com/owner/repo.git", "https://<redacted>@github.com/owner/repo.git"],
    ["user info inside a longer value", "--registry=https://user:PASSWORD_SECRET@registry.example.com/", "--registry=https://<redacted>@registry.example.com/"],
    ["user info without a scheme", "--proxy=//user:PASSWORD_SECRET@proxy.example.com:8080", "--proxy=//<redacted>@proxy.example.com:8080"],
    ["a URL after other words", "  mirror at https://user:PASSWORD_SECRET@example.com/ (internal)", "  mirror at https://<redacted>@example.com/ (internal)"],
    [
      "the query parameter values",
      "https://example.com/feed/?token=TOKEN_SECRET&tenant=TENANT_SECRET#latest",
      "https://example.com/feed/?token=<redacted>&tenant=<redacted>#latest",
    ],
    ["a query parameter without a value", "https://example.com/feed?TOKEN_SECRET", "https://example.com/feed?<redacted>"],
    [
      "the queries of two URLs in one word",
      "https://a.example.com/?sig=A_SECRET#x,https://b.example.com/?sig=B_SECRET",
      "https://a.example.com/?sig=<redacted>#x,https://b.example.com/?sig=<redacted>",
    ],
  ])("masks %s", ([, value, expected], { expect }) => {
    expect(stringified(value)).toBe(expected)
  })

  test.for([
    "https://example.com/updates/",
    "git+https://github.com/owner/repo.git#v1.0.0",
    "git@github.com:owner/repo.git",
    "Foo Bar <foo@example.com>",
    "npm:package@1.0.0",
    "Are you sure? Yes",
    "Questions? See https://example.com/faq?",
    "index.html?page=1",
    "**/*.{js,json}",
    "${productName}-${version}.${ext}",
  ])("keeps %s as it is", (value, { expect }) => {
    expect(stringified(value)).toBe(value)
  })

  test("masks every cscLink, cscInstallerLink and pkcs11KeyUri at any depth, and the names it is given", ({ expect }) => {
    const json = safeStringifyConfig(
      {
        cscLink: "ROOT_SECRET",
        mac: { cscLink: "SAME_SECRET", cscInstallerLink: "INSTALLER_SECRET" },
        win: { cscLink: "SAME_SECRET", sign: { type: "pkcs11", pkcs11KeyUri: "pkcs11:object=MyKey?pin-value=PIN_SECRET" } },
        packager: { name: "NOT_SERIALIZED_SECRET" },
      },
      new Set(["packager"])
    )
    expect(json).not.toMatch(/SECRET/)
    const masked = JSON.parse(json)
    for (const value of [masked.cscLink, masked.mac.cscLink, masked.mac.cscInstallerLink, masked.win.sign.pkcs11KeyUri]) {
      expect(value).toMatch(FINGERPRINT)
    }
    // equal values have equal fingerprints
    expect(masked.mac.cscLink).toBe(masked.win.cscLink)
    expect(masked.packager).toBe("<stripped sensitive data>")
  })

  // safeStringifyJson fingerprints at most 16 values by default; a configuration can hold more
  test("fingerprints every masked value, also past 16", ({ expect }) => {
    const publish = Array.from({ length: 20 }, (_, index) => ({ provider: "github", token: `TOKEN_${index}_SECRET` }))
    const masked = JSON.parse(safeStringifyConfig({ publish }))
    expect(masked.publish.map((it: { token: string }) => FINGERPRINT.test(it.token))).toEqual(publish.map(() => true))
  })
})

test("the invalid configuration entry of the debug logger masks certificate links and URL credentials", async ({ expect }) => {
  const debugLogger = new DebugLogger(true)
  const config = {
    win: {
      cscLink: "WIN_CSC_LINK_SECRET",
      notAnOption: "https://user:PASSWORD_SECRET@example.com/?token=TOKEN_SECRET",
    },
  } as Configuration
  await expect(validateConfiguration(config, debugLogger)).rejects.toThrow(/notAnOption/)
  const entry = debugLogger.data.get("invalidConfig")
  expect(entry).toContain("notAnOption")
  expect(entry).toContain("https://<redacted>@example.com/?token=<redacted>")
  expect(entry).not.toMatch(/SECRET/)
})
