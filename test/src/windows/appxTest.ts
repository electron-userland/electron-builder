import { Arch, Platform } from "electron-builder"
import { app, copyTestAsset } from "../helpers/packTester"
import * as path from "path"
import { mkdir } from "fs/promises"
import { isEnvTrue } from "builder-util"

// test that we can get info from protected pfx
const protectedCscLink =
  "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"

const it = process.platform === "darwin" ? test.ifAll.ifDevOrWinCi : test

it.ifDevOrWinCi(
  "AppX",
  app(
    {
      targets: Platform.WINDOWS.createTarget(["appx"], Arch.x64),
    },
    {
      projectDirCreated: async projectDir => {
        const targetDir = path.join(projectDir, "build", "appx")
        await mkdir(targetDir, { recursive: true })
        await Promise.all(["BadgeLogo.scale-100.png", "BadgeLogo.scale-140.png", "BadgeLogo.scale-180.png"].map(it => copyTestAsset(`appx-assets/${it}`, path.join(targetDir, it))))
      },
      signedWin: true,
    }
  )
)

it.ifDevOrWinCi(
  "auto launch",
  app(
    {
      targets: Platform.WINDOWS.createTarget(["appx"], Arch.x64),
      config: {
        appx: {
          addAutoLaunchExtension: true,
        },
      },
    },
    {}
  )
)

const it2 = isEnvTrue(process.env.DO_APPX_CERT_STORE_AWARE_TEST) ? test : test.skip
it2.ifNotCi(
  "certificateSubjectName",
  app({
    targets: Platform.WINDOWS.createTarget(["appx"], Arch.x64),
    config: {
      win: {
        certificateSubjectName: "Foo",
      },
    },
  })
)

// todo - check manifest
it(
  "languages and not signed (windows store only)",
  app({
    targets: Platform.WINDOWS.createTarget(["appx"], Arch.ia32, Arch.x64),
    config: {
      cscLink: protectedCscLink,
      cscKeyPassword: "test",
      appx: {
        languages: ["de-DE", "ru-RU"],
      },
    },
  })
)
