import * as path from "path"
import { readJson } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import depCheck, { DepCheckResult } from "depcheck"

const printErrorAndExit = require("../../../packages/electron-builder/out/util/promise").printErrorAndExit

const knownUnusedDevDependencies = new Set([
  "@develar/types",
  "jest-cli",
  "decompress-zip",
  "husky",
  "path-sort",
  "typescript",
  "tslint",
  "depcheck"
])

async function main(): Promise<void> {
  const rootDir = path.join(__dirname, "../../..")
  const projectDir = path.join(rootDir, "packages/electron-builder")

  console.log(`Checking ${projectDir}`)

  const result = await new BluebirdPromise<DepCheckResult>(function (resolve) {
    depCheck(projectDir, {
      ignoreDirs: [
        "out", "test", "docs", "typings", "docker", "certs", "templates", "vendor",
      ],
    }, resolve)
  })

  if (result.dependencies.length > 0) {
    throw new Error(`Unused dependencies: ${JSON.stringify(result.dependencies, null, 2)}`)
  }

  const unusedDevDependencies = result.devDependencies.filter(it => !it.startsWith("@types/") && !knownUnusedDevDependencies.has(it))
  if (unusedDevDependencies.length > 0) {
    throw new Error(`Unused devDependencies: ${JSON.stringify(unusedDevDependencies, null, 2)}`)
  }

  if (result.missing.length > 0) {
    throw new Error(`Missing devDependencies: ${JSON.stringify(result.missing, null, 2)}`)
  }

  const packageData = await readJson(path.join(projectDir, "package.json"))
  const devPackageData = await readJson(path.join(rootDir, "package.json"))
  for (const name of Object.keys(devPackageData.devDependencies)) {
    if (packageData.dependencies[name] != null) {
      continue
    }

    const usages = result.using[name]
    if (usages == null || usages.length === 0) {
      continue
    }

    for (const file of usages) {
      if (file.startsWith(path.join(projectDir, "src") + path.sep)) {
        throw new Error(`Dev dependency ${name} is used in the sources`)
      }
    }
  }
}

main()
  .catch(printErrorAndExit)