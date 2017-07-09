import { readdir } from "fs-extra-p"
import * as path from "path"

const workerFarm = require("worker-farm")

const printErrorAndExit = require("../../../packages/electron-builder-util/out/promise").printErrorAndExit

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")
const workers = workerFarm(path.join(packageDir, "lint.js"))


async function main(): Promise<void> {
  const packages = (await readdir(packageDir)).filter(it => !it.includes(".")).sort()
  for (const name of packages) {
    if (name.includes("electron-forge-maker-")) {
      continue
    }

    workers(path.join(packageDir, name), (error: Error, hasError: boolean) => {
      if (hasError) {
        process.exitCode = 1
      }
    })
  }
  workerFarm.end(workers)
}

main()
  .catch(printErrorAndExit)