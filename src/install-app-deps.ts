#! /usr/bin/env node

import { computeDefaultAppDirectory, installDependencies, getElectronVersion, use } from "./util/util"
import { printErrorAndExit } from "./util/promise"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { DevMetadata } from "./metadata"
import yargs = require("yargs")
import { readPackageJson } from "./util/readPackageJson"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

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

  if (results[0] === projectDir) {
    throw new Error("install-app-deps is only useful for two package.json structure")
  }

  await installDependencies(results[0], results[1], args.arch)
}

main()
  .catch(printErrorAndExit)