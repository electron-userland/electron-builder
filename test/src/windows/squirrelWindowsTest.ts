import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"

test.ifAll.ifNotCiMac(
  "Squirrel.Windows",
  app(
    {
      targets: Platform.WINDOWS.createTarget(["squirrel"]),
      config: {
        win: {
          compression: "normal",
        },
      },
    },
    { signedWin: true }
  )
)

test.ifAll.ifNotCiMac(
  "artifactName",
  app({
    targets: Platform.WINDOWS.createTarget(["squirrel", "zip"]),
    config: {
      win: {
        // tslint:disable:no-invalid-template-strings
        artifactName: "Test ${name} foo.${ext}",
      },
    },
  })
)

// very slow
test.skip(
  "delta and msi",
  app({
    targets: Platform.WINDOWS.createTarget("squirrel", Arch.ia32),
    config: {
      squirrelWindows: {
        remoteReleases: "https://github.com/develar/__test-app-releases",
        msi: true,
      },
    },
  })
)

test.ifAll("detect install-spinner", () => {
  let platformPackager: CheckingWinPackager | null = null
  let loadingGifPath: string | null = null

  return assertPack(
    "test-app-one",
    {
      targets: Platform.WINDOWS.createTarget("squirrel"),
      platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingWinPackager(packager)),
    },
    {
      projectDirCreated: it => {
        loadingGifPath = path.join(it, "build", "install-spinner.gif")
        return copyTestAsset("install-spinner.gif", loadingGifPath)
      },
      packed: async () => {
        expect(platformPackager!!.effectiveDistOptions.loadingGif).toEqual(loadingGifPath)
      },
    }
  )
})
