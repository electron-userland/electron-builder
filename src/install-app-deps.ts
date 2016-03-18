#! /usr/bin/env node

import { DEFAULT_APP_DIR_NAME, installDependencies, commonArgs, getElectronVersion, readPackageJson } from "./util"
import { printErrorAndExit } from "./promise"
import * as path from "path"
import cla = require("command-line-args")

const args = cla(commonArgs.concat({
  name: "arch",
  type: String,
})).parse()

const devPackageFile = path.join(process.cwd(), "package.json")
const appDir = args.appDir || DEFAULT_APP_DIR_NAME

readPackageJson(devPackageFile)
  .then(async (it) => installDependencies(path.join(process.cwd(), appDir), await getElectronVersion(it, devPackageFile), args.arch))
  .catch(printErrorAndExit)