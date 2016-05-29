#! /usr/bin/env node

import { PackagerOptions, commonTargets } from "./platformPackager"
import { normalizePlatforms } from "./packager"
import { build } from "./builder"
import { PublishOptions } from "./gitHubPublisher"
import { printErrorAndExit } from "./promise"
import yargs = require("yargs")
import { underline } from "chalk"
import { Platform } from "./metadata"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

interface CliOptions extends PackagerOptions, PublishOptions {
  osx?: Array<string>
  linux?: Array<string>
  win?: Array<string>

  arch?: string

  x64?: boolean
  ia32?: boolean
}

const args = <CliOptions>(yargs
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
  .option("target", {
    alias: "t",
    describe: "Target package types",
    choices: commonTargets,
  })
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
  .argv)

const platforms = normalizePlatforms(args.platform)
if (args.osx != null && !platforms.includes(Platform.OSX)) {
  platforms.push(Platform.OSX)
}
if (args.linux != null && !platforms.includes(Platform.LINUX)) {
  platforms.push(Platform.LINUX)
}
if (args.win != null && !platforms.includes(Platform.WINDOWS)) {
  platforms.push(Platform.WINDOWS)
}

const archAsProp = args.arch
const archs = archAsProp === "all" ? ["ia32", "x64"] : (archAsProp == null ? [] : [archAsProp])

if (args.x64 && !archs.includes("x64")) {
  archs.push("x64")
}
if (args.ia32 && !archs.includes("ia32")) {
  archs.push("ia32")
}

build(Object.assign({}, args, {
  platform: platforms,
  arch: archs,
}))
  .catch(printErrorAndExit)