import BluebirdPromise from "bluebird-lst"
import { readdir, readJson, writeJson } from "fs-extra-p"
import * as path from "path"
import * as semver from "semver"

const printErrorAndExit = require("../../../packages/electron-builder-util/out/promise").printErrorAndExit
const exec = require("../../../packages/electron-builder-util/out/util").exec

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")

async function main(): Promise<void> {
  const packages = (await readdir(packageDir)).filter(it => !it.includes(".")).sort()

  const packageData = await BluebirdPromise.map(packages, it => readJson(path.join(packageDir, it, "package.json")))
  const args = process.argv.slice(2)
  if (args.length > 0 && args[0] === "p") {
    await setPackageVersions(packages, packageData)
  }
  else {
    await setPackageVersions(packages, packageData)
    await setDepVersions(packages, packageData)
  }
}

async function setPackageVersions(packages: Array<string>, packageData: Array<any>) {
  const versions = await BluebirdPromise.map(packages, it => exec("node", [path.join(rootDir, "test", "vendor", "yarn.js"), "info", "--json", it, "dist-tags"])
    .then((it: string) => {
      if (it === "") {
        // {"type":"error","data":"Received invalid response from npm."}
        // not yet published to npm
        return "0.0.1"
      }

      try {
        return JSON.parse(it).data
      }
      catch (e) {
        throw new Error(`Cannot parse ${it}: ${e.stack || e}`)
      }
    }))
  for (let i = 0; i < packages.length; i++) {
    const packageName = packages[i]
    const packageJson = packageData[i]
    const versionInfo = versions[i]
    const latestVersion = versionInfo.next || versionInfo.latest
    if (latestVersion == null || packageJson.version == latestVersion || semver.lt(latestVersion, packageJson.version)) {
      continue
    }

    packageJson.version = latestVersion
    console.log(`Set ${packageName} version to ${latestVersion}`)
    await writeJson(path.join(packageDir, packageName, "package.json"), packageJson, {spaces: 2})
  }
}

async function setDepVersions(packages: Array<string>, packageData: Array<any>) {
  const versions = packageData.map(it => it.version)
  for (let i = 0; i < packages.length; i++) {
    const packageName = packages[i]
    const packageJson = packageData[i]
    let changed = false
    for (let depIndex = 0; depIndex < packages.length; depIndex++) {
      const depPackageName = packages[depIndex]
      let oldVersion = packageJson.dependencies == null ? null : packageJson.dependencies[depPackageName]
      if (oldVersion == null) {
        continue
      }

      let range = ""
      if (oldVersion.startsWith("~") || oldVersion.startsWith("^")) {
        range = oldVersion[0]
        oldVersion = oldVersion.substring(1)
      }

      const newVersion = versions[depIndex]
      if (oldVersion == newVersion || newVersion === "0.0.0-semantic-release") {
        console.log(`Skip ${depPackageName} for ${packageName} — version ${newVersion} is actual`)
        continue
      }

      changed = true
      packageJson.dependencies[depPackageName] = range + newVersion
      console.log(`Set ${depPackageName} to ${newVersion} from ${oldVersion} for ${packageName}`)
    }

    if (changed) {
      await writeJson(path.join(packageDir, packageName, "package.json"), packageJson, {spaces: 2})
    }
  }
}

main()
  .catch(printErrorAndExit)