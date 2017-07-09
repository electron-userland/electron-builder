import BluebirdPromise from "bluebird-lst"
import { bold } from "chalk"
import depCheck, { DepCheckResult } from "depcheck"
import { readdir, readJson } from "fs-extra-p"
import * as path from "path"

require("v8-compile-cache")

const printErrorAndExit = require("../../../packages/electron-builder-util/out/promise").printErrorAndExit

const knownUnusedDevDependencies = new Set([
])

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")

async function check(projectDir: string, devPackageData: any): Promise<boolean> {
  const packageName = path.basename(projectDir)
  // console.log(`Checking ${projectDir}`)

  const result = await new BluebirdPromise<DepCheckResult>(resolve => {
    depCheck(projectDir, {
      ignoreDirs: [
        "src", "test", "docs", "typings", "docker", "certs", "templates", "vendor",
      ],
    }, resolve)
  })

  // console.log(result)

  if (result.dependencies.length > 0) {
    console.error(`${bold(packageName)} Unused dependencies: ${JSON.stringify(result.dependencies, null, 2)}`)
    return false
  }

  const unusedDevDependencies = result.devDependencies.filter(it => !it.startsWith("@types/") && !knownUnusedDevDependencies.has(it))
  if (unusedDevDependencies.length > 0) {
    console.error(`${bold(packageName)} Unused devDependencies: ${JSON.stringify(unusedDevDependencies, null, 2)}`)
    return false
  }

  delete (result.missing as any).electron
  const toml = (result.missing as any).toml
  if (toml != null && toml.length === 1 && toml[0].endsWith("config.js")) {
    delete (result.missing as any).toml
  }

  const squirrel = (result.missing as any)["electron-builder-squirrel-windows"]
  if (squirrel != null && squirrel.length === 1 && squirrel[0].endsWith("winPackager.js")) {
    delete (result.missing as any)["electron-builder-squirrel-windows"]
  }

  if (Object.keys(result.missing).length > 0) {
    console.error(`${bold(packageName)} Missing dependencies: ${JSON.stringify(result.missing, null, 2)}`)
    return false
  }

  const packageData = await readJson(path.join(projectDir, "package.json"))
  for (const name of Object.keys(devPackageData.devDependencies)) {
    if (packageData.dependencies != null && packageData.dependencies[name] != null) {
      continue
    }

    const usages = result.using[name]
    if (usages == null || usages.length === 0) {
      continue
    }

    for (const file of usages) {
      if (file.startsWith(path.join(projectDir, "src") + path.sep)) {
        console.error(`${bold(packageName)} Dev dependency ${name} is used in the sources`)
        return false
      }
    }
  }

  return true
}

async function main(): Promise<void> {
  const packages = (await readdir(packageDir)).filter(it => !it.includes(".")).sort()
  const devPackageData = await readJson(path.join(rootDir, "package.json"))
  if ((await BluebirdPromise.map(packages, it => check(path.join(packageDir, it), devPackageData))).includes(false)) {
    process.exitCode = 1
  }
}

main()
  .catch(printErrorAndExit)