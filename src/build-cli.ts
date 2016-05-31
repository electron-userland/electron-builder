#! /usr/bin/env node

// import { commonTargets } from "./platformPackager"
import { build, CliOptions } from "./builder"
import { printErrorAndExit } from "./promise"
import { underline } from "chalk"
import yargs = require("yargs")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export function createYargs(): any {
  return yargs
    .version()
    .option("osx", {
      alias: "o",
      describe: "Build for OS X",
      type: "array",
    })
    .option("linux", {
      alias: "l",
      describe: "Build for Linux",
      type: "array",
    })
    .option("win", {
      alias: ["w", "windows"],
      describe: "Build for Windows",
      type: "array",
    })
    .option("x64", {
      describe: "Build for x64",
      type: "boolean",
    })
    .option("ia32", {
      describe: "Build for ia32",
      type: "boolean",
    })
    // .option("target", {
    //   alias: "t",
    //   describe: "Target package types",
    //   choices: commonTargets,
    // })
    .option("publish", {
      alias: "p",
      describe: `Publish artifacts (to GitHub Releases), see ${underline("https://goo.gl/WMlr4n")}`,
      choices: ["onTag", "onTagOrDraft", "always", "never"],
    })
    .option("platform", {
      choices: ["osx", "win", "linux", "darwin", "win32", "all"],
    })
    .option("arch", {
      choices: ["ia32", "x64", "all"],
    })
    .option("npmRebuild", {
      describe: "Runs npm rebuild before starting to package the app.",
      default: true,
      type: "boolean",
    })
    .strict()
    .help()
    .epilog(`Project home: ${underline("https://github.com/electron-userland/electron-builder")}`)
}

if (!module.parent) {
  build(<CliOptions>(createYargs().argv))
    .catch(printErrorAndExit)
}