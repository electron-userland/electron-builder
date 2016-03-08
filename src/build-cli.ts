#! /usr/bin/env node

import { PackagerOptions } from "./platformPackager"
import { build } from "./builder"
import { PublishOptions } from "./gitHubPublisher"
import { commonArgs } from "./util"
import { printErrorAndExit } from "./promise"
import cla = require("command-line-args")
import { readFileSync } from "fs"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

interface CliOptions extends PackagerOptions, PublishOptions {
  help: boolean
}

const cli = cla(commonArgs.concat(
  {name: "dist", type: Boolean, alias: "d", description: "Whether to package in a distributable format (e.g. DMG, windows installer, NuGet package)."},
  {name: "publish", type: String, alias: "p", description: "Publish artifacts (to GitHub Releases): onTag (on tag push only) or onTagOrDraft (on tag push or if draft release exists)."},
  {name: "platform", type: String, multiple: true, description: "darwin, linux, win32 or all. Current platform (" + process.platform + ") by default."},
  {name: "arch", type: String, description: "ia32, x64 or all (by default)."},
  {name: "target", type: String, multiple: true, description: "Installer or package type. For win32: squirrel (default) or nsis (deprecated)."},
  {name: "sign", type: String},
  {name: "help", alias: "h", type: Boolean, description: "Display this usage guide."}
))

const args: CliOptions = cli.parse()

if (args.help) {
  const version = process.env.npm_package_version || JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version
  console.log(cli.getUsage({
    title: "electron-builder " + version,
    footer: "Project home: [underline]{https://github.com/loopline-systems/electron-builder}"
  }))
}
else {
  build(args)
    .catch(printErrorAndExit)
}