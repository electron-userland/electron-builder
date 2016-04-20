#! /usr/bin/env node

import { computeDefaultAppDirectory, installDependencies, commonArgs, getElectronVersion, readPackageJson } from "./util"
import { printErrorAndExit } from "./promise"
import * as path from "path"
import cla = require("command-line-args")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const args = cla(commonArgs.concat({
  name: "arch",
  type: String,
})).parse()

const projectDir = process.cwd()
const devPackageFile = path.join(projectDir, "package.json")
const appDir = computeDefaultAppDirectory(projectDir, args.appDir)

readPackageJson(devPackageFile)
  .then(async (it) => installDependencies(appDir, await getElectronVersion(it, devPackageFile), args.arch))
  .catch(printErrorAndExit)