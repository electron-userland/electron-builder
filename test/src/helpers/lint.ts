import * as path from "path"
import { promises as fs } from "fs"

const workerFarm = require("worker-farm")

const printErrorAndExit = require("../../../packages/builder-util/out/promise").printErrorAndExit

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")
const workers = workerFarm({maxRetries: 1, maxCallTime: 2 * 60 * 1000}, path.join(rootDir, "scripts", "lint.js"))

async function main(): Promise<void> {
  const packages = (await fs.readdir(packageDir)).filter(it => !it.includes(".")).sort()
  for (const name of packages) {
    if (name.includes("electron-forge-maker-") || name.includes("electron-installer-")) {
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