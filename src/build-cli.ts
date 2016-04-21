#! /usr/bin/env node

import { PackagerOptions } from "./platformPackager"
import { build } from "./builder"
import { PublishOptions } from "./gitHubPublisher"
import { printErrorAndExit } from "./promise"
import cla = require("command-line-args")
import { readFileSync } from "fs"
import * as path from "path"
import { warn } from "./util"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

interface CliOptions extends PackagerOptions, PublishOptions {
  help: boolean
}

const cli = cla([
  {name: "dist", type: Boolean, alias: "d", description: "Whether to package in a distributable format (e.g. DMG, windows installer, NuGet package)."},
  {name: "publish", type: String, alias: "p", description: "Publish artifacts (to GitHub Releases): onTag (on tag push only) or onTagOrDraft (on tag push or if draft release exists)."},
  {name: "platform", type: String, multiple: true, description: "darwin, linux, win32 or all. Current platform (" + process.platform + ") by default."},
  {name: "arch", type: String, description: "ia32, x64 or all. Defaults to architecture you're running on."},
  {name: "sign", type: String},
  {name: "help", alias: "h", type: Boolean, description: "Display this usage guide."},
  {name: "appDir", type: String}
])

const args: CliOptions = cli.parse()

if (args.help) {
  const version = process.env.npm_package_version || JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version
  console.log(cli.getUsage({
    title: "electron-builder " + version,
    footer: "Project home: [underline]{https://github.com/electron-userland/electron-builder}",
    hide: ["appDir"],
  }))
}
else {
  if (args.appDir) {
    warn(`-appDir CLI parameter is deprecated, please configure build.directories.app instead 
See https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-app`)
  }

  build(args)
    .catch(printErrorAndExit)
}