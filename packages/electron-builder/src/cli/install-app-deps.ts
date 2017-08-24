#! /usr/bin/env node

import BluebirdPromise from "bluebird-lst"
import { log, use, warn } from "builder-util"
import { printErrorAndExit } from "builder-util/out/promise"
import { readJson } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { orNullIfFileNotExist } from "read-config-file"
import yargs from "yargs"
import { computeDefaultAppDirectory, getConfig } from "../util/config"
import { getElectronVersion } from "../util/electronVersion"
import { createLazyProductionDeps } from "../util/packageDependencies"
import { installOrRebuild } from "../util/yarn"

declare const PACKAGE_VERSION: string

/** @internal */
export function configureInstallAppDepsCommand(yargs: yargs.Yargs): yargs.Yargs {
  // https://github.com/yargs/yargs/issues/760
  // demandOption is required to be set
  return yargs
    .option("platform", {
      choices: ["linux", "darwin", "win32"],
      default: process.platform,
      description: "The target platform",
    })
    .option("arch", {
      choices: ["ia32", "x64", "all"],
      default: process.arch,
      description: "The target arch",
    })
}

/** @internal */
export async function installAppDeps(args: any) {
  try {
    log("electron-builder " + PACKAGE_VERSION)
  }
  catch (e) {
    // error in dev mode without babel
    if (!(e instanceof ReferenceError)) {
      throw e
    }
  }

  const projectDir = process.cwd()
  const packageMetadata = new Lazy(() => orNullIfFileNotExist(readJson(path.join(projectDir, "package.json"))))
  const config = await getConfig(projectDir, null, null, packageMetadata)
  const muonVersion = config.muonVersion
  const results = await BluebirdPromise.all<string>([
    computeDefaultAppDirectory(projectDir, use(config.directories, it => it!.app)),
    muonVersion == null ? getElectronVersion(projectDir, config, packageMetadata) : BluebirdPromise.resolve(muonVersion),
  ])

  // if two package.json — force full install (user wants to install/update app deps in addition to dev)
  await installOrRebuild(config, results[0], {
    frameworkInfo: {version: results[1], useCustomDist: muonVersion == null},
    platform: args.platform,
    arch: args.arch,
    productionDeps: createLazyProductionDeps(results[0]),
  }, results[0] !== projectDir)
}

function main() {
  return installAppDeps(configureInstallAppDepsCommand(yargs).argv)
}

if (process.mainModule === module) {
  warn("Please use as subcommand: electron-builder install-app-deps")
  main()
    .catch(printErrorAndExit)
}