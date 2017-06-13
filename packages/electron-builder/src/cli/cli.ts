#! /usr/bin/env node

import { underline } from "chalk"
import { printErrorAndExit } from "electron-builder-util/out/promise"
import yargs from "yargs"
import { buildCommandHandler, configureBuildCommand } from "../builder"
import { createSelfSignedCert } from "./create-self-signed-cert"
import { configureInstallAppDepsCommand, installAppDeps } from "./install-app-deps"

yargs
  .command(<any>["build", "*"], "Build", configureBuildCommand, buildCommandHandler)
  .command("install-app-deps", "Install app deps", configureInstallAppDepsCommand, argv => {
    installAppDeps(argv)
      .catch(printErrorAndExit)
  })
  .command("create-self-signed-cert", "Create self-signed code signing cert for Windows apps",
    yargs => yargs
      .option("publisher", {
        alias: ["p"],
        type: "string",
        requiresArg: true,
      })
      .demandOption("publisher"),
    argv => {
      createSelfSignedCert(argv.publisher)
        .catch(printErrorAndExit)
    })
  .help()
  .epilog(`See the Wiki (${underline("https://github.com/electron-userland/electron-builder/wiki")}) for more documentation.`)
  .strict()
  .argv
