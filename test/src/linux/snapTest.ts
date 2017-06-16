import { Platform } from "electron-builder"
import { readFile } from "fs-extra-p"
import { app, assertPack } from "../helpers/packTester"

if (process.env.SNAP_TEST === "false") {
  fit("Skip snapTest suite — SNAP_TEST is set to false", () => {
    console.warn("[SKIP] Skip snapTest suite — SNAP_TEST is set to false")
  })
}

const snapTarget = Platform.LINUX.createTarget("snap")

test.skip("platform", app({
  targets: snapTarget,
  config: {
    extraMetadata: {
      name: "sep-p",
    },
    productName: "Sep P",
    linux: {
      executableName: "Sep"
    },
    snap: {
      ubuntuAppPlatformContent: "ubuntu-app-platform1",
    },
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
