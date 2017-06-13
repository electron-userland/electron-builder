#! /usr/bin/env node

import BluebirdPromise from "bluebird-lst"
import { computeDefaultAppDirectory, use } from "electron-builder-util"
import { printErrorAndExit } from "electron-builder-util/out/promise"
import yargs from "yargs"
import { getElectronVersion, loadConfig } from "../util/readPackageJson"
import { installOrRebuild } from "../yarn"

export function configureInstallAppDepsCommand(yargs: yargs.Yargs): yargs.Yargs {
  return yargs
    .option("platform", {
      choices: ["linux", "darwin", "win32"],
      default: process.platform,
    })
    .option("arch", {
      choices: ["ia32", "x64", "all"],
      default: process.arch,
    })
}

export async function installAppDeps(args: any) {
  const projectDir = process.cwd()
  const config = (await loadConfig(projectDir)) || {}
  const muonVersion = config.muonVersion
  const results = await BluebirdPromise.all<string>([
    computeDefaultAppDirectory(projectDir, use(config.directories, it => it!.app)),
    muonVersion == null ? getElectronVersion(config, projectDir) : BluebirdPromise.resolve(muonVersion),
  ])

  // if two package.json — force full install (user wants to install/update app deps in addition to dev)
  await installOrRebuild(config, results[0], {version: results[1], useCustomDist: muonVersion == null}, args.platform, args.arch, results[0] !== projectDir)
}

function main() {
  return installAppDeps(configureInstallAppDepsCommand(yargs).argv)
}

if (process.mainModule === module) {
  main()
    .catch(printErrorAndExit)
}