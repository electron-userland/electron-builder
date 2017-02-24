import { Platform } from "electron-builder"
import { app, assertPack } from "../helpers/packTester"

if (process.env.SNAP_TEST === "false") {
  fit("Skip snapTest suite — SNAP_TEST is set to false", () => {
    console.warn("[SKIP] Skip snapTest suite — SNAP_TEST is set to false")
  })
}

test.ifAll.ifDevOrLinuxCi("platform", app({
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

test.ifAll.ifDevOrLinuxCi("snap", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    productName: "Sep",
  },
  appMetadata: {
    name: "sep",
  },
}))

test.ifAll.ifDevOrLinuxCi("default stagePackages", async () => {
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
        delete snap.parts.app.source
        expect(snap).toMatchSnapshot()
        return true
      }
    })
  }
})
