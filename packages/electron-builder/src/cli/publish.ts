#! /usr/bin/env node

import { getElectronVersion } from "app-builder-lib/out/electron/electronVersion"
import { computeDefaultAppDirectory, getConfig } from "app-builder-lib/out/util/config"
import { installOrRebuild } from "app-builder-lib/out/util/yarn"
import { PACKAGE_VERSION } from "app-builder-lib/out/version"
import { createLazyProductionDeps } from "app-builder-lib/out/util/packageDependencies"
import { InvalidConfigurationError, log, use } from "builder-util"
import { printErrorAndExit } from "builder-util/out/promise"
import { readJson, readdir } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { orNullIfFileNotExist } from "read-config-file"
import * as yargs from "yargs"
import { CancellationToken, Packager, PackagerOptions, PublishManager, PublishOptions } from "app-builder-lib"

/** @internal */
export function configurePublishCommand(yargs: yargs.Argv): yargs.Argv {
  // https://github.com/yargs/yargs/issues/760
  // demandOption is required to be set
  return yargs
    .parserConfiguration({
      "camel-case-expansion": false,
    })
    .option("distDir", {
      alias: "d",
      type: "string",
      requiresArg: true,
      description: "The path to the electron-builder artifacts",
    })
    .demandOption("dist")
}

/** @internal */
export async function publish(args: any) {
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

  const prepackagedAppDir = args.distDir
  const newArtifacts = await readdir(prepackagedAppDir)
  await publishPackageWithOptions(config, newArtifacts)
  // const [appDir, version] = await Promise.all<string>([
  //   computeDefaultAppDirectory(
  //     projectDir,
  //     use(config.directories, it => it.app)
  //   ),
  //   getElectronVersion(projectDir, config),
  // ])

  // // if two package.json — force full install (user wants to install/update app deps in addition to dev)
  // await installOrRebuild(
  //   config,
  //   appDir,
  //   {
  //     frameworkInfo: { version, useCustomDist: true },
  //     platform: args.platform,
  //     arch: args.arch,
  //     productionDeps: createLazyProductionDeps(appDir, null),
  //   },
  //   appDir !== projectDir
  // )
}

/** @internal */
async function publishPackageWithOptions(
  options: PackagerOptions & PublishOptions,
  newArtifacts: string[],
  cancellationToken: CancellationToken = new CancellationToken(),
  packager: Packager = new Packager(options, cancellationToken),
) {
  const publishManager = new PublishManager(packager, options, cancellationToken)
  const publishConfigurations = await publishManager.getGlobalPublishConfigurations()
  if (publishConfigurations == null || publishConfigurations.length === 0) {
    throw new InvalidConfigurationError("unable to find any publish configuration")
  }

  const updateFile = newArtifacts.find((artifact) => artifact.includes('app-update.yml'))
  if (!updateFile) {
    throw new InvalidConfigurationError("no app-update.yml found, unable to proceed with publishing")
  }

  for (const newArtifact of newArtifacts) {
    for (const publishConfiguration of publishConfigurations) {
      publishManager.scheduleUpload(
        publishConfiguration,
        {
          file: newArtifact,
          arch: null,
        },
        packager.appInfo
      )
    }
  }
}
function main() {
  return publish(configurePublishCommand(yargs).argv)
}

if (require.main === module) {
  log.warn("please use as subcommand: electron-builder publish")
  main().catch(printErrorAndExit)
}
