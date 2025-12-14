import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { CheckingMacPackager } from "../helpers/CheckingPackager"
import { assertPack, createMacTargetTest, signed } from "../helpers/packTester"

describe.runIf(process.platform === "darwin" && process.env.CSC_KEY_PASSWORD != null)("mas", () => {
  test("mas", ({ expect }) => createMacTargetTest(expect, ["mas"]))
  test.ifNotCi("dev", ({ expect }) => createMacTargetTest(expect, ["mas-dev"]))
  test.ifNotCi("mas and 7z", ({ expect }) => createMacTargetTest(expect, ["mas", "7z"]))

  const entitlement = (fileName: string) => path.join("build", fileName)
  const entitlementsConfig = {
    entitlements: entitlement("entitlements.mac.plist"),
    entitlementsInherit: entitlement("entitlements.mac.inherit.plist"),
    entitlementsLoginHelper: entitlement("entitlements.mac.login.plist"),
  }

  const targets = Platform.MAC.createTarget(undefined, Arch.x64)

  test.skip("custom mas", ({ expect }) => {
    let platformPackager: CheckingMacPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      signed({
        targets,
        platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingMacPackager(packager)),
        config: {
          mac: {
            target: ["mas"],
          },
          mas: entitlementsConfig,
        },
      }),
      {
        checkMacApp(appDir, info) {
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

  test("entitlements in the package.json", ({ expect }) => {
    let platformPackager: CheckingMacPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      signed({
        targets,
        platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingMacPackager(packager)),
        config: {
          mac: entitlementsConfig,
        },
      }),
      {
        checkMacApp(appDir, info) {
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

  test("entitlements template", ({ expect }) => {
    let platformPackager: CheckingMacPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      signed({
        targets,
        platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingMacPackager(packager)),
      }),
      {
        checkMacApp(appDir, info) {
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
