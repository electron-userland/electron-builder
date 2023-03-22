import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { CheckingMacPackager } from "../helpers/CheckingPackager"
import { assertPack, createMacTargetTest, signed } from "../helpers/packTester"

if (process.platform !== "darwin") {
  fit("Skip mas tests because platform is not macOS", () => {
    console.warn("[SKIP] Skip mas tests because platform is not macOS")
  })
} else if (process.env.CSC_KEY_PASSWORD == null) {
  fit("Skip mas tests because CSC_KEY_PASSWORD is not defined", () => {
    console.warn("[SKIP] Skip mas tests because CSC_KEY_PASSWORD is not defined")
  })
}

test("mas", createMacTargetTest(["mas"]))
test.ifNotCi.ifAll("dev", createMacTargetTest(["mas-dev"]))
test.ifNotCi.ifAll("mas and 7z", createMacTargetTest(["mas", "7z"]))

const entitlement = (fileName: string) => path.join("build", fileName)
const entitlementsConfig = {
  entitlements: entitlement("entitlements.mac.plist"),
  entitlementsInherit: entitlement("entitlements.mac.inherit.plist"),
  entitlementsLoginHelper: entitlement("entitlements.mac.login.plist"),
}

const targets = Platform.MAC.createTarget(undefined, Arch.x64)

test.skip.ifAll("custom mas", () => {
  let platformPackager: CheckingMacPackager | null = null
  return assertPack(
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

test.ifAll.ifNotCi("entitlements in the package.json", () => {
  let platformPackager: CheckingMacPackager | null = null
  return assertPack(
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

test.ifAll.ifNotCi("entitlements template", () => {
  let platformPackager: CheckingMacPackager | null = null
  return assertPack(
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
