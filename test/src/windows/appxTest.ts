import { Arch, Platform } from "electron-builder"
import { app, copyTestAsset } from "../helpers/packTester"
import * as path from "path"
import BluebirdPromise from "bluebird-lst"
import { ensureDir } from "fs-extra-p"

// test that we can get info from protected pfx
const protectedCscLink = "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"

const it = process.platform === "darwin" ? test.ifAll.ifDevOrWinCi : test

it.ifDevOrWinCi("AppX", app({
  targets: Platform.WINDOWS.createTarget(["appx"], Arch.x64),
}, {
  projectDirCreated: async projectDir => {
    const targetDir = path.join(projectDir, "build", "appx")
    await ensureDir(targetDir)
    await BluebirdPromise.map(["BadgeLogo.scale-100.png", "BadgeLogo.scale-140.png", "BadgeLogo.scale-180.png"], name => copyTestAsset(`appx-assets/${name}`, path.join(targetDir, name)))
  },
  signedWin: true,
}))

it.ifNotCi("certificateSubjectName", app({
  targets: Platform.WINDOWS.createTarget(["appx"], Arch.x64),
  config: {
    win: {
      certificateSubjectName: "Foo",
    }
  },
}))

// todo - check manifest
it("languages and not signed (windows store only)", app({
  targets: Platform.WINDOWS.createTarget(["appx"], Arch.ia32, Arch.x64),
  cscLink: protectedCscLink,
  cscKeyPassword: "test",
  config: {
    appx: {
      languages: ["de-DE", "ru-RU"]
    }
  }
}))