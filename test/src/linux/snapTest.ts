import { Platform } from "electron-builder"
import { readFile } from "fs-extra-p"
import { app, assertPack } from "../helpers/packTester"

if (process.env.SNAP_TEST === "false") {
  fit("Skip snapTest suite — SNAP_TEST is set to false", () => {
    console.warn("[SKIP] Skip snapTest suite — SNAP_TEST is set to false")
  })
}

const snapTarget = Platform.LINUX.createTarget("snap")

test.ifAll.ifDevOrLinuxCi("platform", app({
  targets: snapTarget,
  config: {
    productName: "Sep P",
    linux: {
      executableName: "Sep"
    },
    snap: {
      ubuntuAppPlatformContent: "ubuntu-app-platform1",
    },
  },
  appMetadata: {
    name: "sep-p",
  },
  effectiveOptionComputed: async ({snap, desktopFile}) => {
    delete snap.parts.app.source
    delete snap.parts.extra.source
    expect(snap).toMatchSnapshot()

    const content = await readFile(desktopFile, "utf-8")
    expect(content).toMatchSnapshot()
    return false
  },
}))

test.ifAll.ifDevOrLinuxCi("snap", app({
  targets: snapTarget,
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
      effectiveOptionComputed: async ({snap}) => {
        delete snap.parts.app.source
        expect(snap).toMatchSnapshot()
        return true
      },
    })
  }
})
