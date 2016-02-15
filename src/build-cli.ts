#! /usr/bin/env node

import { PackagerOptions } from "./platformPackager"
import { build } from "./builder"
import { PublishOptions } from "./gitHubPublisher"
import { commonArgs } from "./util"
import { printErrorAndExit } from "./promise"
import { tsAwaiter } from "./awaiter"
import cla = require("command-line-args")

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

interface CliOptions extends PackagerOptions, PublishOptions {
  build: boolean
  help: boolean
}

const cli = cla(commonArgs.concat(
  {name: "arch", type: String, description: "ia32, x64 or all (by default)."},
  {name: "dist", type: Boolean, alias: "d", description: "Whether to package in a distributable format (e.g. DMG, windows installer, NuGet package)."},
  {name: "publish", type: String, alias: "p", description: "Publish artifacts (to GitHub Releases): onTag (on tag push only) or onTagOrDraft (on tag push or if draft release exists)."},
  {name: "build", type: Boolean, description: "Deprecated, use dist instead."},
  {name: "sign", type: String},
  {name: "platform", type: String, description: "darwin or win32. Current platform (" + process.platform + ") by default."},
  {name: "help", alias: "h", type: Boolean}
))

const args: CliOptions = cli.parse()

if (args.help) {
  console.log(cli.getUsage({hide: ["build"]}))
}
else {
  if (args.build) {
    args.dist = true
  }

  build(args)
    .catch(printErrorAndExit)
}