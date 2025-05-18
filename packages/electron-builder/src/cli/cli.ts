#! /usr/bin/env node

import { getElectronVersion } from "app-builder-lib"
import { loadEnv } from "app-builder-lib"
import { nodeGypRebuild } from "app-builder-lib"
import { ExecError, InvalidConfigurationError, log } from "builder-util"
import chalk from "chalk"
import * as path from "path"
import { build, configureBuildCommand, createYargs } from "../builder.js"
import { configurePublishCommand, publish } from "../publish.js"
import { createSelfSignedCert } from "./create-self-signed-cert.js"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps.js"
import { start } from "./start.js"
import updateNotifier from "update-notifier"

import packageJson from "../../package.json" with { type: "json" }

// tslint:disable:no-unused-expression
void createYargs()
  .command(["build", "*"], "Build", configureBuildCommand, wrap(build))
  .command("install-app-deps", "Install app deps", configureInstallAppDepsCommand, wrap(installAppDeps))
  .command("node-gyp-rebuild", "Rebuild own native code", configureInstallAppDepsCommand /* yes, args the same as for install app deps */, wrap(rebuildAppNativeCode))
  .command("publish", "Publish a list of artifacts", configurePublishCommand, wrap(publish))
  .command(
    "create-self-signed-cert",
    "Create self-signed code signing cert for Windows apps",
    yargs =>
      yargs
        .option("publisher", {
          alias: ["p"],
          type: "string",
          requiresArg: true,
          description: "The publisher name",
        })
        .demandOption("publisher"),
    wrap(argv => createSelfSignedCert(argv.publisher))
  )
  .command(
    "start",
    "Run application in a development mode using electron-webpack",
    yargs => yargs,
    wrap(() => start())
  )
  .help()
  .epilog(`See ${chalk.underline("https://electron.build")} for more documentation.`)
  .strict()
  .recommendCommands().argv

function wrap(task: (args: any) => Promise<any>) {
  return (args: any) => {
    checkIsOutdated()
    loadEnv(path.join(process.cwd(), "electron-builder.env"))
      .then(() => task(args))
      .catch(error => {
        process.exitCode = 1
        // https://github.com/electron-userland/electron-builder/issues/2940
        process.on("exit", () => (process.exitCode = 1))
        if (error instanceof InvalidConfigurationError) {
          log.error(null, error.message)
        } else if (!(error instanceof ExecError) || !error.alreadyLogged) {
          log.error({ failedTask: task.name, stackTrace: error.stack }, error.message)
        }
        const nextTagAvailable = checkIsOutdated("next", false)
        if (nextTagAvailable != null) {
          log.info(nextTagAvailable, `if experiencing issues, please consider trying ${chalk.bold("npm i electron-builder@next")}`)
        }
      })
  }
}

function checkIsOutdated(distTag = "latest", shouldNotify = true) {
  if (process.env.NO_UPDATE_NOTIFIER != null) {
    return null
  }
  try {
    const notify = updateNotifier({ pkg: packageJson, distTag, shouldNotifyInNpmScript: true })
    if (shouldNotify) {
      notify.notify({ isGlobal: false, defer: false })
    }
    return notify.update
  } catch (error: any) {
    log.warn({ error: error.message ?? error }, "cannot check is update is available")
  }
  return null
}

async function rebuildAppNativeCode(args: any) {
  const projectDir = process.cwd()
  // this script must be used only for electron
  return nodeGypRebuild(args.platform, args.arch, { version: await getElectronVersion(projectDir), useCustomDist: true })
}
