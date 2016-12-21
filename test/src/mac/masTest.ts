import { assertPack, signed, CheckingMacPackager, createMacTargetTest } from "../helpers/packTester"
import { writeFile } from "fs-extra-p"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { Platform } from "out"

if (process.platform !== "darwin") {
  fit("Skip mas tests because platform is not macOS", () => {
    console.warn("[SKIP] Skip mas tests because platform is not macOS")
  })
}
else if (process.env.CSC_KEY_PASSWORD == null) {
  fit("Skip mas tests because CSC_KEY_PASSWORD is not defined", () => {
    console.warn("[SKIP] Skip mas tests because CSC_KEY_PASSWORD is not defined")
  })
}

test("mas", createMacTargetTest(["mas"], ["Test App ßW-1.1.0.pkg"]))
test("mas and 7z", createMacTargetTest(["mas", "7z"], ["Test App ßW-1.1.0-mac.7z", "Test App ßW-1.1.0.pkg"]))

test("custom mas", () => {
  let platformPackager: CheckingMacPackager = null
  return assertPack("test-app-one", signed({
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
    config: {
      mac: {
        target: ["mas"],
      },
      mas: {
        entitlements: "mas-entitlements file path",
        entitlementsInherit: "mas-entitlementsInherit file path",
      }
    }
  }), {
    packed: () => {
      expect(platformPackager.effectiveSignOptions).toMatchObject({
        entitlements: "mas-entitlements file path",
        "entitlements-inherit": "mas-entitlementsInherit file path",
      })
      return BluebirdPromise.resolve(null)
    }
  })
})

test("entitlements in the package.json", () => {
  let platformPackager: CheckingMacPackager = null
  return assertPack("test-app-one", signed({
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
    config: {
      mac: {
        entitlements: "osx-entitlements file path",
        entitlementsInherit: "osx-entitlementsInherit file path",
      }
    }
  }), {
    packed: () => {
      expect(platformPackager.effectiveSignOptions).toMatchObject({
        entitlements: "osx-entitlements file path",
        "entitlements-inherit": "osx-entitlementsInherit file path",
      })
      return BluebirdPromise.resolve()
    }
  })
})

test("entitlements in build dir", () => {
  let platformPackager: CheckingMacPackager = null
  return assertPack("test-app-one", signed({
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
  }), {
    projectDirCreated: projectDir => BluebirdPromise.all([
      writeFile(path.join(projectDir, "build", "entitlements.mac.plist"), ""),
      writeFile(path.join(projectDir, "build", "entitlements.mac.inherit.plist"), ""),
    ]),
    packed: context => {
      expect(platformPackager.effectiveSignOptions).toMatchObject({
        entitlements: path.join(context.projectDir, "build", "entitlements.mac.plist"),
        "entitlements-inherit": path.join(context.projectDir, "build", "entitlements.mac.inherit.plist"),
      })
      return BluebirdPromise.resolve()
    }
  })
})
