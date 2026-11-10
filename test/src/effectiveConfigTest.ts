import fsExtra from "fs-extra"
import * as path from "path"
import { log } from "builder-util"
import { test, vi } from "vitest"
import { app, linuxDirTarget } from "./helpers/packTester.js"
import { Configuration } from "electron-builder"

const effectiveConfigFile = (outDir: string) => path.join(outDir, "builder-effective-config.yaml")

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

test("the effective config and its debug log mask every certificate link and URL credentials", ({ expect }) => {
  const debug = vi.spyOn(log, "debug")
  const config: Configuration = {
    writeEffectiveConfig: true,
    mac: { cscLink: "MAC_CSC_LINK_SECRET", cscInstallerLink: "MAC_INSTALLER_LINK_SECRET" },
    win: { cscLink: "WIN_CSC_LINK_SECRET" },
    snapcraft: { base: "core24", cscLink: "SNAP_STORE_LOGIN_SECRET" },
    nsisWeb: { appPackageUrl: "https://web-user:WEB_PASSWORD_SECRET@example.com/packages" },
    publish: { provider: "generic", url: "https://feed-user:FEED_P@SSWORD_SECRET@example.com/updates" },
  }
  return app(
    expect,
    { targets: linuxDirTarget, config },
    {
      packed: async context => {
        const effectiveConfigLog = debug.mock.calls.find(([, message]) => message === "effective config")
        for (const content of [await fsExtra.readFile(effectiveConfigFile(context.outDir), "utf8"), String((effectiveConfigLog?.[0] as any)?.config)]) {
          expect(content).not.toMatch(/SECRET/)
          expect(content).toMatch(/^ +cscLink: /m)
          expect(content).toMatch(/cscInstallerLink: /)
          expect(content).toContain("https://<redacted>@example.com/updates")
          expect(content).toContain("https://<redacted>@example.com/packages")
        }
      },
    }
  )
})
