#! /usr/bin/env node
import { getElectronVersion, exec } from "../util/util"
import { printErrorAndExit } from "../util/promise"
import * as path from "path"
import yargs from "yargs"
import { readPackageJson } from "../util/readPackageJson"
import { log } from "../util/log"
import { getGypEnv } from "../yarn"

const args: any = yargs
  .option("platform", {
    choices: ["linux", "darwin", "win32"],
    default: process.platform,
  })
  .option("arch", {
    choices: ["ia32", "x64", "armv7l"],
    default: process.arch,
  }).argv

const projectDir = process.cwd()
const devPackageFile = path.join(projectDir, "package.json")

async function main() {
  log(`Execute node-gyp rebuild for ${args.platform}:${args.arch}`)
  await exec(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp", ["rebuild"], {
    env: getGypEnv(await getElectronVersion(await readPackageJson(devPackageFile), devPackageFile), args.platform, args.arch, true),
  })
}

main()
  .catch(printErrorAndExit)