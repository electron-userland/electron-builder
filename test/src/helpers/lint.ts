import BluebirdPromise from "bluebird-lst-c"
import { readdir } from "fs-extra-p"
import * as path from "path"
import { cpus } from "os"

const printErrorAndExit = require("../../../packages/electron-builder-util/out/promise").printErrorAndExit
const spawn = require("../../../packages/electron-builder-util/out/util").spawn

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")

async function main(): Promise<void> {
  const packages = (await readdir(packageDir)).filter(it => !it.includes(".")).sort()
  await BluebirdPromise.map(packages, it => spawn(process.env.npm_node_execpath || process.env.NODE_EXE || "node", [path.join(packageDir, "lint.js"), path.join(packageDir, it)], {
    stdio: ["ignore", "inherit", "pipe"],
  }), {concurrency: cpus().length})
}

main()
  .catch(printErrorAndExit)