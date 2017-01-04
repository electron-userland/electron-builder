import * as path from "path"
import { readdir, readJson, writeJson } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"

const printErrorAndExit = require("../../../packages/electron-builder/out/util/promise").printErrorAndExit
// const exec = require("../../../packages/electron-builder/out/util/util").exec

async function main(): Promise<void> {
  const rootDir = path.join(__dirname, "../../..")
  const packageDir = path.join(rootDir, "packages")
  const packages = (await readdir(packageDir)).filter(it => !it.includes(".")).sort()
  // const versions = await BluebirdPromise.map(packages, it => exec("node", [path.join(rootDir, "test", "vendor", "yarn.js"), "info", "--json", it, "dist-tags"]).then((it: string) => JSON.parse(it).data))
  const packageData = await BluebirdPromise.map(packages, it => readJson(path.join(packageDir, it, "package.json")))
  const versions = packageData.map(it => it.version)

  for (let version of versions) {
    if (version == "0.0.0-semantic-release") {
      throw new Error(`Semantic version 0.0.0-semantic-release is detected, please fix it`)
    }
  }

  for (let i = 0; i < packages.length; i++) {
    const packageName = packages[i]
    const packageJson = packageData[i]
    let changed = false
    for (let depIndex = 0; depIndex < packages.length; depIndex++) {
      const depPackageName = packages[depIndex]
      const oldVersion = packageJson.dependencies[depPackageName]
      const newVersion = versions[depIndex]
      if (oldVersion == null) {
        continue
      }

      if (oldVersion == newVersion) {
        console.log(`Skip ${depPackageName} for ${packageName} — version ${newVersion} is actual`)
        continue
      }

      changed = true
      packageJson.dependencies[depPackageName] = newVersion
      console.log(`Set ${depPackageName} to ${newVersion} from ${oldVersion} for ${packageName}`)
    }

    if (changed) {
      await writeJson(path.join(packageDir, packageName, "package.json"), packageJson, {spaces: 2})
    }
  }
}

main()
  .catch(printErrorAndExit)