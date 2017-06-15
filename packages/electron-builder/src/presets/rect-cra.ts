import { deepAssign } from "electron-builder-util/out/deepAssign"
import { statOrNull } from "electron-builder-util/out/fs"
import { warn } from "electron-builder-util/out/log"
import * as path from "path"
import { Config } from "../metadata"

/** @internal */
export async function reactCra(config: Config, projectDir: string) {
  if ((await statOrNull(path.join(projectDir, "public", "electron.js"))) == null) {
    warn("public/electron.js not found. Please see https://medium.com/@kitze/%EF%B8%8F-from-react-to-an-electron-app-ready-for-production-a0468ecb1da3")
  }

  deepAssign(config, <Config>{
    directories: {
      buildResources: "assets"
    },
    files: ["build/**/*"],
    extraMetadata: {
      main: "build/electron.js"
    }
  })
}