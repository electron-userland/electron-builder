#! /usr/bin/env node

import { build, CliOptions } from "./builder"
import { printErrorAndExit } from "./promise"
import { createYargs } from "./cliOptions"
import { readJson } from "fs-extra-p"
import * as path from "path"

import updateNotifier = require("update-notifier")
import { warn } from "./log"

if (process.env.CI == null && process.env.NO_UPDATE_NOTIFIER == null) {
  readJson(path.join(__dirname, "..", "package.json"))
    .then(it => {
      updateNotifier({
        pkg: it
      }).notify()
    })
    .catch(e => {
      warn(`Cannot check updates: ${e}`)
    })
}

build(<CliOptions>(createYargs().argv))
  .catch(printErrorAndExit)