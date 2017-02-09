import { Platform } from "electron-builder"
import { app, assertPack } from "../helpers/packTester"
import isCi from "is-ci"

if (isCi ? process.platform !== "linux" : (process.env.SNAP_TEST == null && process.env.TEST_DIR != null)) {
  fit("Skip snapTest suite — not Linux CI or env SNAP_TEST not set to true", () => {
    console.warn("[SKIP] Skip snapTest suite — not Linux CI or env SNAP_TEST not set to true")
  })
}

test("platform", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    productName: "Sep P",
    snap: {
      ubuntuAppPlatformContent: "ubuntu-app-platform1",
    },
  },
  appMetadata: {
    name: "sep-p",
  },
}))

test("snap", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    productName: "Sep",
  },
  appMetadata: {
    name: "sep",
  },
}))

test("default stagePackages", async () => {
  for (const p of [["default"], ["default", "custom"], ["custom", "default"], ["foo1", "default", "foo2"]]) {
    await assertPack("test-app-one", {
      targets: Platform.LINUX.createTarget("snap"),
      config: {
        productName: "Sep",
        snap: {
          stagePackages: p,
          plugs: p,
        }
      },
      appMetadata: {
        name: "sep",
      },
      effectiveOptionComputed: async (snap) => {
        expect(snap).toMatchSnapshot()
        return true
      }
    })
  }
})
