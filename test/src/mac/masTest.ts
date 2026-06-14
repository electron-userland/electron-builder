import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { CheckingMacPackager } from "../helpers/CheckingPackager.js"
import { assertPack, createMacTargetTest, signed } from "../helpers/packTester.js"

describe.ifMac("mas", () => {
  // MAS pack+sign requires Apple-issued identities ("Apple Distribution" / "3rd Party Mac Developer …") and
  // a provisioning profile, which the ephemeral self-signed identity cannot satisfy — so skip these unless a
  // real cert is provided via env (MAC_CSC_LINK). The entitlement-resolution tests below use
  // CheckingMacPackager (no real signing) and still run.
  const masSignTest = process.env.MAC_CSC_LINK == null ? test.skip : test.ifMac
  masSignTest("mas", ({ expect }) => createMacTargetTest(expect, ["mas"]))
  masSignTest("dev", ({ expect }) => createMacTargetTest(expect, ["mas-dev"]))
  masSignTest("mas and 7z", ({ expect }) => createMacTargetTest(expect, ["mas", "7z"]))

  const entitlement = (fileName: string) => path.join("build", fileName)
  const entitlementsConfig = {
    entitlements: entitlement("entitlements.mac.plist"),
    entitlementsInherit: entitlement("entitlements.mac.inherit.plist"),
    entitlementsLoginHelper: entitlement("entitlements.mac.login.plist"),
  }

  const targets = Platform.MAC.createTarget(undefined, Arch.x64)

  test.skip("custom mas", async ({ expect }) => {
    let platformPackager: CheckingMacPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      await signed({
        targets,
        platformPackagerFactory: (packager, _platform) => (platformPackager = new CheckingMacPackager(packager)),
        config: {
          mac: {
            target: ["mas"],
          },
          mas: { sign: entitlementsConfig },
        },
      }),
      {
        checkMacApp(appDir, _info) {
          const appEntitlements = (filePath: string) => platformPackager!.effectiveSignOptions?.optionsForFile?.(filePath)
          expect(appEntitlements(appDir)?.entitlements).toBe(entitlementsConfig.entitlements)
          expect(appEntitlements("Library/LoginItems")?.entitlements).toBe(entitlementsConfig.entitlementsLoginHelper)
          expect(appEntitlements("anything")?.entitlements).toBe(entitlementsConfig.entitlementsInherit)

          expect(appEntitlements(appDir)?.hardenedRuntime).toBe(false)
          return Promise.resolve()
        },
      }
    )
  })

  test("entitlements in the package.json", async ({ expect }) => {
    let platformPackager: CheckingMacPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      await signed({
        targets,
        platformPackagerFactory: (packager, _platform) => (platformPackager = new CheckingMacPackager(packager)),
        config: {
          mac: { sign: entitlementsConfig },
        },
      }),
      {
        checkMacApp(appDir, _info) {
          const appEntitlements = (filePath: string) => platformPackager!.effectiveSignOptions?.optionsForFile?.(filePath)
          expect(appEntitlements(appDir)?.entitlements).toBe(entitlementsConfig.entitlements)
          expect(appEntitlements("Library/LoginItems")?.entitlements).toBe(entitlementsConfig.entitlementsLoginHelper)
          expect(appEntitlements("anything")?.entitlements).toBe(entitlementsConfig.entitlementsInherit)

          expect(appEntitlements(appDir)?.hardenedRuntime).toBe(true)
          return Promise.resolve()
        },
      }
    )
  })

  test("entitlements template", async ({ expect }) => {
    let platformPackager: CheckingMacPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      await signed({
        targets,
        platformPackagerFactory: (packager, _platform) => (platformPackager = new CheckingMacPackager(packager)),
      }),
      {
        checkMacApp(appDir, _info) {
          const appEntitlements = (filePath: string) => platformPackager!.effectiveSignOptions?.optionsForFile?.(filePath)
          expect(appEntitlements(appDir)?.entitlements).toBe(entitlementsConfig.entitlements)
          expect(appEntitlements("Library/LoginItems")?.entitlements).toBe(entitlementsConfig.entitlements)
          expect(appEntitlements("anything")?.entitlements).toBe(entitlementsConfig.entitlements)
          return Promise.resolve()
        },
      }
    )
  })
})
