#! /usr/bin/env node
import { build, CliOptions } from "../builder"
import { printErrorAndExit } from "electron-builder-util/out/promise"
import { createYargs } from "./cliOptions"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { dim, reset, green, cyan } from "chalk"
import updateNotifier from "update-notifier"
import { warn } from "electron-builder-util/out/log"
import isCi from "is-ci"

if (!isCi && process.env.NO_UPDATE_NOTIFIER == null) {
  readJson(path.join(__dirname, "..", "..", "package.json"))
    .then(it => {
      const notifier = updateNotifier({pkg: it})
      if (notifier.update != null) {
        notifier.notify({
          message: `Update available ${dim(notifier.update.current)}${reset(" → ")}${green(notifier.update.latest)} \nRun ${cyan("npm i electron-builder --save-dev")} to update`
        })
      }
    })
    .catch(e => warn(`Cannot check updates: ${e}`))
}

build(<CliOptions>(createYargs().argv))
  .catch(printErrorAndExit)