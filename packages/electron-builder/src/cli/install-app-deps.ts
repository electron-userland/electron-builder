#! /usr/bin/env node
import { getElectronVersion } from "app-builder-lib"
import { determinePackageManagerEnv } from "app-builder-lib/src/node-module-collector/index.js"
import { computeDefaultAppDirectory } from "app-builder-lib/src/util/config/config.js"
import { getConfig } from "app-builder-lib/src/util/config/config.js"
import { createLazyProductionDeps } from "app-builder-lib/src/util/packageDependencies.js"
import { installOrRebuild } from "app-builder-lib/src/util/yarn.js"
import { PACKAGE_VERSION } from "app-builder-lib/src/version.js"
import { getArchCliNames, log, orNullIfFileNotExist, printErrorAndExit } from "builder-util"
import { readJson } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Argv } from "yargs"
import { createYargs } from "../builder.js"

/** @internal */
export function configureInstallAppDepsCommand(yargs: Argv): Argv {
  // https://github.com/yargs/yargs/issues/760
  // demandOption is required to be set
  return yargs
    .parserConfiguration({
      "camel-case-expansion": false,
    })
    .option("platform", {
      choices: ["linux", "darwin", "win32"],
      default: process.platform,
      description: "The target platform",
    })
    .option("arch", {
      choices: getArchCliNames().concat("all"),
      default: process.arch === "arm" ? "armv7l" : process.arch,
      description: "The target arch",
    })
}

/** @internal */
export async function installAppDeps(args: any) {
  try {
    log.info({ version: PACKAGE_VERSION }, "electron-builder")
  } catch (e: any) {
    // error in dev mode without babel
    if (!(e instanceof ReferenceError)) {
      throw e
    }
  }

  const projectDir = process.cwd()
  const packageMetadata = new Lazy(() => orNullIfFileNotExist(readJson(path.join(projectDir, "package.json"))))
  const config = await getConfig(projectDir, null, null, packageMetadata)
  const [appDir, version] = await Promise.all<string>([computeDefaultAppDirectory(projectDir, config.directories?.app), getElectronVersion(projectDir, config)])

  const packageManagerEnv = determinePackageManagerEnv({ projectDir, appDir, workspaceRoot: undefined })

  // if two package.json — force full install (user wants to install/update app deps in addition to dev)
  await installOrRebuild(
    config,
    {
      appDir,
      projectDir,
      workspaceRoot: await (await packageManagerEnv.value).workspaceRoot,
    },
    {
      frameworkInfo: { version, useCustomDist: true },
      platform: args.platform,
      arch: args.arch,
      productionDeps: createLazyProductionDeps(appDir, null, false),
    },
    appDir !== projectDir,
    {}
  )
}

function main() {
  return installAppDeps(configureInstallAppDepsCommand(createYargs()).argv)
}

if (require.main === module) {
  log.warn("please use as subcommand: electron-builder install-app-deps")
  main().catch(printErrorAndExit)
}
