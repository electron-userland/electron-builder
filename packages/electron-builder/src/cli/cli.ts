#! /usr/bin/env node

import { InvalidConfigurationError, log } from "builder-util"
import * as chalk from "chalk"
import { getElectronVersion } from "app-builder-lib/out/electron/electronVersion"
import { pathExists, readJson } from "fs-extra"
import * as isCi from "is-ci"
import * as path from "path"
import { loadEnv } from "read-config-file"
import * as updateNotifier from "update-notifier"
import { ExecError } from "builder-util/out/util"
import { build, configureBuildCommand, createYargs } from "../builder"
import { createSelfSignedCert } from "./create-self-signed-cert"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps"
import { start } from "./start"
import { nodeGypRebuild } from "app-builder-lib/out/util/yarn"

// tslint:disable:no-unused-expression
void createYargs()
  .command(["build", "*"], "Build", configureBuildCommand, wrap(build))
  .command("install-app-deps", "Install app deps", configureInstallAppDepsCommand, wrap(installAppDeps))
  .command("node-gyp-rebuild", "Rebuild own native code", configureInstallAppDepsCommand /* yes, args the same as for install app deps */, wrap(rebuildAppNativeCode))
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
      })
  }
}

function checkIsOutdated() {
  if (isCi || process.env.NO_UPDATE_NOTIFIER != null) {
    return
  }

  readJson(path.join(__dirname, "..", "..", "package.json"))
    .then(async it => {
      if (it.version === "0.0.0-semantic-release") {
        return
      }

      const packageManager = (await pathExists(path.join(__dirname, "..", "..", "package-lock.json"))) ? "npm" : "yarn"

      const notifier = updateNotifier({ pkg: it })
      if (notifier.update != null) {
        notifier.notify({
          message: `Update available ${chalk.dim(notifier.update.current)}${chalk.reset(" → ")}${chalk.green(notifier.update.latest)} \nRun ${chalk.cyan(
            `${packageManager} upgrade electron-builder`
          )} to update`,
        })
      }
    })
    .catch(e => log.warn({ error: e }, "cannot check updates"))
}

async function rebuildAppNativeCode(args: any) {
  const projectDir = process.cwd()
  // this script must be used only for electron
  return nodeGypRebuild(args.platform, args.arch, { version: await getElectronVersion(projectDir), useCustomDist: true })
}
