#! /usr/bin/env node

import { getElectronVersion, nodeGypRebuild } from "app-builder-lib/internal"
import chalk from "chalk"
import { build, configureBuildCommand, createYargs } from "../builder.js"
import { configurePublishCommand, publish } from "../publish.js"
import { clearCache } from "./clear-cache.js"
import { wrap } from "./cli-util.js"
import { createSelfSignedCert } from "./create-self-signed-cert.js"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps.js"
import { configureMigrateSchemaCommand, migrateSchema } from "./migrate-schema.js"
import { start } from "./start.js"

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
  .command("migrate-schema", "Migrate build config from v26 to v27 format", configureMigrateSchemaCommand, wrap(migrateSchema))
  .help()
  .epilog(`See ${chalk.underline("https://electron.build")} for more documentation.`)
  .strict()
  .recommendCommands().argv

async function rebuildAppNativeCode(args: any) {
  const projectDir = process.cwd()
  // this script must be used only for electron
  return nodeGypRebuild(args.platform, args.arch, { version: await getElectronVersion(projectDir), useCustomDist: true })
}
