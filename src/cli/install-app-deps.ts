#! /usr/bin/env node
import { computeDefaultAppDirectory, getElectronVersion, use } from "../util/util"
import { printErrorAndExit } from "../util/promise"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { DevMetadata } from "../metadata"
import yargs from "yargs"
import { readPackageJson } from "../util/readPackageJson"
import { installOrRebuild } from "../yarn"

async function main() {
  const args: any = yargs
    .option("arch", {
      choices: ["ia32", "x64", "all"],
    }).argv

  const projectDir = process.cwd()
  const devPackageFile = path.join(projectDir, "package.json")

  const devMetadata: DevMetadata = await readPackageJson(devPackageFile)
  const results: Array<string> = await BluebirdPromise.all([
    computeDefaultAppDirectory(projectDir, use(devMetadata.directories, it => it!.app)),
    getElectronVersion(devMetadata, devPackageFile)
  ])

  // if two package.json — force full install (user wants to install/update app deps in addition to dev)
  await installOrRebuild(devMetadata.build, results[0], results[1], args.arch, results[0] !== projectDir)
}

main()
  .catch(printErrorAndExit)