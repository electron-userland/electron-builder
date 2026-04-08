#! /usr/bin/env node

<<<<<<< HEAD
import { getElectronVersion, nodeGypRebuild } from "app-builder-lib/internal"
import chalk from "chalk"
import { build, configureBuildCommand, createYargs } from "../builder.js"
import { configurePublishCommand, publish } from "../publish.js"
import { clearCache } from "./clear-cache.js"
import { wrap } from "./cli-util.js"
import { createSelfSignedCert } from "./create-self-signed-cert.js"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps.js"
import { start } from "./start.js"
=======
import { getElectronVersion } from "app-builder-lib/out/electron/electronVersion"
import { loadEnv } from "app-builder-lib/out/util/config/load"
import { nodeGypRebuild } from "app-builder-lib/out/util/yarn"
import { ExecError, InvalidConfigurationError, log } from "builder-util"
import * as chalk from "chalk"
import fsExtra from "fs-extra"
import { isCI } from "ci-info"
import * as path from "path"
import { build, configureBuildCommand, createYargs } from "../builder.js"
import { configurePublishCommand, publish } from "../publish.js"
<<<<<<< HEAD
import { createSelfSignedCert } from "./create-self-signed-cert.js.js"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps.js.js"
import { start } from "./start.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { createSelfSignedCert } from "./create-self-signed-cert.js"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps.js"
import { start } from "./start.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

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
  .command(
    "clear-cache",
    "Clear the electron-builder default cache directory",
    yargs => yargs,
    wrap(() => clearCache())
  )
  .help()
  .epilog(`See ${chalk.underline("https://electron.build")} for more documentation.`)
  .strict()
  .recommendCommands().argv

<<<<<<< HEAD
=======
function wrap(task: (args: any) => Promise<any>) {
  return (args: any) => {
    checkIsOutdated().catch((e: any) => log.warn({ error: e }, "cannot check updates"))
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

async function checkIsOutdated() {
  if (isCI || process.env.NO_UPDATE_NOTIFIER != null) {
    return
  }

  const pkg = await fsExtra.readJson(path.join(import.meta.dirname, "..", "..", "package.json"))
  if (pkg.version === "0.0.0-semantic-release") {
    return
  }
  const UpdateNotifier = require("simple-update-notifier")
  await UpdateNotifier({ pkg })
}

>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
async function rebuildAppNativeCode(args: any) {
  const projectDir = process.cwd()
  // this script must be used only for electron
  return nodeGypRebuild(args.platform, args.arch, { version: await getElectronVersion(projectDir), useCustomDist: true })
}
