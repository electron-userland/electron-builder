#! /usr/bin/env node

import { computeDefaultAppDirectory, installDependencies, getElectronVersion, readPackageJson, use } from "./util"
import { printErrorAndExit } from "./promise"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { DevMetadata } from "./metadata"
import yargs = require("yargs")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const args: any = yargs
  .option("arch", {
    choices: ["ia32", "x64", "all"],
  }).argv

const projectDir = process.cwd()
const devPackageFile = path.join(projectDir, "package.json")

async function main() {
  const devMetadata: DevMetadata = await readPackageJson(devPackageFile)
  const results: Array<string> = await BluebirdPromise.all([
    computeDefaultAppDirectory(projectDir, use(devMetadata.directories, it => it!.app)),
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