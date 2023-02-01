import { Platform } from "electron-builder"
import * as path from "path"
import { CheckingMacPackager } from "../helpers/CheckingPackager"
import { assertPack, createMacTargetTest, signed } from "../helpers/packTester"
import * as fs from "fs/promises"

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

test.skip.ifAll("custom mas", () => {
  let platformPackager: CheckingMacPackager | null = null
  return assertPack(
    "test-app-one",
    signed({
      targets: Platform.MAC.createTarget(),
      platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingMacPackager(packager)),
      config: {
        mac: {
          target: ["mas"],
        },
        mas: {
          entitlements: "mas-entitlements file path",
          entitlementsInherit: "mas-entitlementsInherit file path",
        },
      },
    }),
    {
      packed: () => {
        expect(platformPackager!!.effectiveSignOptions).toMatchObject({
          entitlements: "mas-entitlements file path",
          "entitlements-inherit": "mas-entitlementsInherit file path",
        })
        return Promise.resolve(null)
      },
    }
  )
})

test.ifAll.ifNotCi("entitlements in the package.json", () => {
  let platformPackager: CheckingMacPackager | null = null
  return assertPack(
    "test-app-one",
    signed({
      targets: Platform.MAC.createTarget(),
      platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingMacPackager(packager)),
      config: {
        mac: {
          entitlements: "osx-entitlements file path",
          entitlementsInherit: "osx-entitlementsInherit file path",
        },
      },
    }),
    {
      packed: () => {
        expect(platformPackager!!.effectiveSignOptions).toMatchObject({
          entitlements: "osx-entitlements file path",
          "entitlements-inherit": "osx-entitlementsInherit file path",
        })
        return Promise.resolve()
      },
    }
  )
})

test.ifAll.ifNotCi("entitlements in build dir", () => {
  let platformPackager: CheckingMacPackager | null = null
  return assertPack(
    "test-app-one",
    signed({
      targets: Platform.MAC.createTarget(),
      platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingMacPackager(packager)),
    }),
    {
      projectDirCreated: projectDir =>
        Promise.all([
          fs.writeFile(path.join(projectDir, "build", "entitlements.mac.plist"), ""),
          fs.writeFile(path.join(projectDir, "build", "entitlements.mac.inherit.plist"), ""),
        ]),
      packed: context => {
        expect(platformPackager!!.effectiveSignOptions).toMatchObject({
          entitlements: path.join(context.projectDir, "build", "entitlements.mac.plist"),
          "entitlements-inherit": path.join(context.projectDir, "build", "entitlements.mac.inherit.plist"),
        })
        return Promise.resolve()
      },
    }
  )
})
