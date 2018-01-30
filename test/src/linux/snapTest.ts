import { Platform } from "electron-builder"
import { app, assertPack } from "../helpers/packTester"

if (process.env.SNAP_TEST === "false") {
  fit("Skip snapTest suite — SNAP_TEST is set to false", () => {
    console.warn("[SKIP] Skip snapTest suite — SNAP_TEST is set to false")
  })
}

const snapTarget = Platform.LINUX.createTarget("snap")

test.ifAll.ifDevOrLinuxCi("snap", app({
  targets: snapTarget,
  config: {
    extraMetadata: {
      name: "sep",
    },
    productName: "Sep",
  },
}))

test.ifAll.ifDevOrLinuxCi("default stagePackages", async () => {
  for (const p of [["default"], ["default", "custom"], ["custom", "default"], ["foo1", "default", "foo2"]]) {
    await assertPack("test-app-one", {
      targets: Platform.LINUX.createTarget("snap"),
      config: {
        extraMetadata: {
          name: "sep",
        },
        productName: "Sep",
        snap: {
          stagePackages: p,
          plugs: p,
          confinement: "classic",
        }
      },
      effectiveOptionComputed: async ({snap}) => {
        delete snap.parts.app.source
        expect(snap).toMatchSnapshot()
        return true
      },
    })
  }
})

test.ifAll.ifDevOrLinuxCi("custom env", app({
  targets: Platform.LINUX.createTarget("snap"),
  config: {
    extraMetadata: {
      name: "sep",
    },
    productName: "Sep",
    snap: {
      environment: {
        FOO: "bar",
      },
    }
  },
  effectiveOptionComputed: async ({snap}) => {
    delete snap.parts.app.source
    expect(snap).toMatchSnapshot()
    return true
  },
}))
