#! /usr/bin/env node

import { DEFAULT_APP_DIR_NAME, installDependencies, commonArgs, getElectronVersion } from "./util"
import { parseJson } from "./promisifed-fs"
import { printErrorAndExit } from "./promise"
import { readFileSync } from "fs"
import * as path from "path"
import cla = require("command-line-args")

const args = cla(commonArgs.concat({
  name: "arch",
  type: String,
})).parse()

const devPackageFile = path.join(process.cwd(), "package.json")

const appDir = args.appDir || DEFAULT_APP_DIR_NAME
installDependencies(path.join(process.cwd(), appDir), args.arch, getElectronVersion(parseJson(readFileSync(devPackageFile, "utf8"), devPackageFile), devPackageFile))
  .catch(printErrorAndExit)