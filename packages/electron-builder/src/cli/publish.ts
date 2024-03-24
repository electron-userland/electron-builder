#! /usr/bin/env node

import { CancellationToken, Packager, PackagerOptions, PublishManager, PublishOptions, UploadTask, checkBuildRequestOptions } from "app-builder-lib"
import { PACKAGE_VERSION } from "app-builder-lib/out/version"
import { computeSafeArtifactNameIfNeeded } from "app-builder-lib/out/platformPackager"
import { InvalidConfigurationError, archFromString, log } from "builder-util"
import { executeFinally, printErrorAndExit } from "builder-util/out/promise"
import * as path from "path"
import * as yargs from "yargs"
import { BuildOptions, normalizeOptions } from "../builder"

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
      description: "The file to upload to your publisher",
    })
    .demandOption("dist")
}

export async function publish(args: { files: string[] }) {
  const uploadTasks = args.files.map(f => {
    return {
      file: path.resolve(f),
      arch: null,
    }
  })
  await publishArtifactsWithOptions(uploadTasks)
}

export async function publishArtifactsWithOptions(uploadOptions: { file: string; arch: string | null }[]) {
  try {
    log.info({ version: PACKAGE_VERSION }, "electron-builder")
  } catch (e: any) {
    // error in dev mode without babel
    if (!(e instanceof ReferenceError)) {
      throw e
    }
  }

  const options: BuildOptions = normalizeOptions({})
  checkBuildRequestOptions(options)

  const uniqueUploads = Array.from(new Set(uploadOptions))
  const tasks: UploadTask[] = uniqueUploads.map(({ file, arch }) => {
    const filename = path.basename(file)
    return { file, arch: arch ? archFromString(arch) : null, safeArtifactName: computeSafeArtifactNameIfNeeded(filename, () => filename) }
  })
  return publishPackageWithTasks(options, tasks)
}

async function publishPackageWithTasks(
  options: PackagerOptions & PublishOptions,
  uploadTasks: UploadTask[],
  cancellationToken: CancellationToken = new CancellationToken(),
  packager: Packager = new Packager(options, cancellationToken)
) {
  const publishManager = new PublishManager(packager, options, cancellationToken)

  const sigIntHandler = () => {
    log.warn("cancelled by SIGINT")
    packager.cancellationToken.cancel()
    publishManager.cancelTasks()
  }
  process.once("SIGINT", sigIntHandler)

  const uploadPromise = async () => {
    const publishConfigurations = await publishManager.getGlobalPublishConfigurations()
    if (publishConfigurations == null || publishConfigurations.length === 0) {
      throw new InvalidConfigurationError("unable to find any publish configuration")
    }

    for (const newArtifact of uploadTasks) {
      for (const publishConfiguration of publishConfigurations) {
        publishManager.scheduleUpload(publishConfiguration, newArtifact, packager.appInfo)
      }
    }
  }

  return executeFinally(Promise.resolve(uploadPromise), isErrorOccurred => {
    let promise: Promise<any>
    if (isErrorOccurred) {
      publishManager.cancelTasks()
      promise = Promise.resolve(null)
    } else {
      promise = publishManager.awaitTasks()
    }

    return promise.then(() => process.removeListener("SIGINT", sigIntHandler))
  })
}

function main() {
  return publish(configurePublishCommand(yargs).argv as any)
}

if (require.main === module) {
  log.warn("please use as subcommand: electron-builder publish")
  main().catch(printErrorAndExit)
}
