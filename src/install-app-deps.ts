#! /usr/bin/env node

import { computeDefaultAppDirectory, installDependencies, getElectronVersion, readPackageJson, use } from "./util"
import { printErrorAndExit } from "./promise"
import * as path from "path"
import cla = require("command-line-args")
import { Promise as BluebirdPromise } from "bluebird"
import { DevMetadata } from "./metadata";

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const args = cla([{name: "arch", type: String}, {name: "appDir", type: String}]).parse()

const projectDir = process.cwd()
const devPackageFile = path.join(projectDir, "package.json")

async function main() {
  const devMetadata: DevMetadata = await readPackageJson(devPackageFile)
  const results: Array<string> = await BluebirdPromise.all([
    computeDefaultAppDirectory(projectDir, use(devMetadata.directories, it => it.app) || args.appDir),
    getElectronVersion(devMetadata, devPackageFile)
  ])

  await installDependencies(results[0], results[1], args.arch)
}

try {
  main()
}
catch (e) {
  printErrorAndExit(e)
}