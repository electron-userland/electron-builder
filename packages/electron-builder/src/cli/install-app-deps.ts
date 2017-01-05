#! /usr/bin/env node

import { computeDefaultAppDirectory, getElectronVersion, use } from "electron-builder-util"
import { printErrorAndExit } from "electron-builder-util/out/promise"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { DevMetadata, getDirectoriesConfig } from "../metadata"
import yargs from "yargs"
import { readPackageJson } from "../util/readPackageJson"
import { installOrRebuild } from "../yarn"

async function main() {
  const args: any = yargs
    .option("platform", {
      choices: ["linux", "darwin", "win32"],
      default: process.platform,
    })
    .option("arch", {
      choices: ["ia32", "x64", "all"],
      default: process.arch,
    })
    .argv

  const projectDir = process.cwd()
  const devPackageFile = path.join(projectDir, "package.json")

  const devMetadata: DevMetadata = await readPackageJson(devPackageFile)
  const results: Array<string> = await BluebirdPromise.all([
    computeDefaultAppDirectory(projectDir, use(getDirectoriesConfig(devMetadata), it => it!.app)),
    getElectronVersion(devMetadata, devPackageFile)
  ])

  // if two package.json — force full install (user wants to install/update app deps in addition to dev)
  await installOrRebuild(devMetadata.build, results[0], results[1], args.platform, args.arch, results[0] !== projectDir)
}

main()
  .catch(printErrorAndExit)