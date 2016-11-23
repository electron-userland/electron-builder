#! /usr/bin/env node
import { build, CliOptions } from "../builder"
import { printErrorAndExit } from "../util/promise"
import { createYargs } from "./cliOptions"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { dim, reset, green, cyan } from "chalk"
import updateNotifier from "update-notifier"
import { warn } from "../util/log"

if (process.env.CI == null && process.env.NO_UPDATE_NOTIFIER == null) {
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