#! /usr/bin/env node

import BluebirdPromise from "bluebird-lst"
import { computeDefaultAppDirectory, use } from "electron-builder-util"
import { printErrorAndExit } from "electron-builder-util/out/promise"
import yargs from "yargs"
import { getElectronVersion, loadConfig } from "../util/readPackageJson"
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
  const config = (await loadConfig(projectDir)) || {}
  const results = await BluebirdPromise.all<string | null>([
    computeDefaultAppDirectory(projectDir, use(config.directories, it => it!.app)),
    config.muonVersion == null ? null : getElectronVersion(config, projectDir),
  ])

  // if two package.json — force full install (user wants to install/update app deps in addition to dev)
  await installOrRebuild(config, results[0]!, {version: (results[1] || config.muonVersion)!, useCustomDist: config.muonVersion == null}, args.platform, args.arch, results[0] !== projectDir)
}

main()
  .catch(printErrorAndExit)