import { Platform } from "electron-builder"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { assertPack, copyTestAsset } from "../helpers/packTester"

describe("squirrel.windows", { sequential: true }, () => {
  test("detect install-spinner", ({ expect }) => {
    let platformPackager: CheckingWinPackager | null = null
    let loadingGifPath: string | null = null

    return assertPack(
      expect,
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
          expect(platformPackager!.effectiveDistOptions.loadingGif).toEqual(loadingGifPath)
        },
      }
    )
  })
})
