#! /usr/bin/env node

import { AppInfo, CancellationToken, Packager, PackagerOptions, PublishManager, PublishOptions, UploadTask, checkBuildRequestOptions } from "app-builder-lib"
import { Publish } from "app-builder-lib/out/core"
import { computeSafeArtifactNameIfNeeded } from "app-builder-lib/out/platformPackager"
import { getConfig } from "app-builder-lib/out/util/config/config"
import { InvalidConfigurationError, archFromString, log, printErrorAndExit } from "builder-util"
import * as chalk from "chalk"
import * as path from "path"
import * as yargs from "yargs"
import { BuildOptions, normalizeOptions } from "./builder"

/** @internal */
export function configurePublishCommand(yargs: yargs.Argv): yargs.Argv {
  // https://github.com/yargs/yargs/issues/760
  // demandOption is required to be set
  return yargs
    .parserConfiguration({
      "camel-case-expansion": false,
    })
    .option("files", {
      alias: "f",
      string: true,
      type: "array",
      requiresArg: true,
      description: "The file(s) to upload to your publisher",
    })
    .option("version", {
      alias: ["v"],
      type: "string",
      description: "The app/build version used when searching for an upload release (used by some Publishers)",
    })
    .option("config", {
      alias: ["c"],
      type: "string",
      description:
        "The path to an electron-builder config. Defaults to `electron-builder.yml` (or `json`, or `json5`, or `js`, or `ts`), see " + chalk.underline("https://goo.gl/YFRJOM"),
    })
    .demandOption("files")
}

export async function publish(args: { files: string[]; version: string | undefined; configurationFilePath: string | undefined }) {
  const uploadTasks = args.files.map(f => {
    return {
      file: path.resolve(f),
      arch: null,
    }
  })
  return publishArtifactsWithOptions(uploadTasks, args.version, args.configurationFilePath)
}

export async function publishArtifactsWithOptions(
  uploadOptions: { file: string; arch: string | null }[],
  buildVersion?: string,
  configurationFilePath?: string,
  publishConfiguration?: Publish
) {
  const projectDir = process.cwd()
  const config = await getConfig(projectDir, configurationFilePath || null, { publish: publishConfiguration, detectUpdateChannel: false })

  const buildOptions: BuildOptions = normalizeOptions({ config })
  checkBuildRequestOptions(buildOptions)

  const uniqueUploads = Array.from(new Set(uploadOptions))
  const tasks: UploadTask[] = uniqueUploads.map(({ file, arch }) => {
    const filename = path.basename(file)
    return { file, arch: arch ? archFromString(arch) : null, safeArtifactName: computeSafeArtifactNameIfNeeded(filename, () => filename) }
  })

  return publishPackageWithTasks(buildOptions, tasks, buildVersion)
}

async function publishPackageWithTasks(
  options: PackagerOptions & PublishOptions,
  uploadTasks: UploadTask[],
  buildVersion?: string,
  cancellationToken: CancellationToken = new CancellationToken(),
  packager: Packager = new Packager(options, cancellationToken)
) {
  await packager.validateConfig()
  const appInfo = new AppInfo(packager, buildVersion)
  const publishManager = new PublishManager(packager, options, cancellationToken)

  const sigIntHandler = () => {
    log.warn("cancelled by SIGINT")
    packager.cancellationToken.cancel()
    publishManager.cancelTasks()
  }
  process.once("SIGINT", sigIntHandler)

  try {
    const publishConfigurations = await publishManager.getGlobalPublishConfigurations()
    if (publishConfigurations == null || publishConfigurations.length === 0) {
      throw new InvalidConfigurationError("unable to find any publish configuration")
    }

    for (const newArtifact of uploadTasks) {
      for (const publishConfiguration of publishConfigurations) {
        await publishManager.scheduleUpload(publishConfiguration, newArtifact, appInfo)
      }
    }

    await publishManager.awaitTasks()
    return uploadTasks
  } catch (error: any) {
    packager.cancellationToken.cancel()
    publishManager.cancelTasks()
    process.removeListener("SIGINT", sigIntHandler)
    log.error({ message: (error.stack || error.message || error).toString() }, "error publishing")
  }
  return null
}

function main() {
  return publish(configurePublishCommand(yargs).argv as any)
}

if (require.main === module) {
  log.warn("please use as subcommand: electron-builder publish")
  main().catch(printErrorAndExit)
}
