import BluebirdPromise from "bluebird-lst"
import { readJson, writeJson } from "fs-extra-p"
import * as path from "path"
import * as semver from "semver"

const printErrorAndExit = require("../../../packages/builder-util/out/promise").printErrorAndExit
const exec = require("../../../packages/builder-util/out/util").exec

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")

async function main(): Promise<void> {
  let packageData: Array<any> = await require("ts-babel/out/util").readProjectMetadata(packageDir)
  packageData = packageData.concat(await BluebirdPromise.map(["electron-installer-appimage", "electron-forge-maker-nsis", "electron-forge-maker-nsis-web", "electron-installer-snap"], it => readJson(path.join(packageDir, it, "package.json"))))
  const args = process.argv.slice(2)
  if (args.length > 0 && args[0] === "p") {
    await setPackageVersions(packageData)
  }
  else {
    await setPackageVersions(packageData)
    await setDepVersions(packageData)
  }
}

async function setPackageVersions(packageData: Array<any>) {
  const versions = await BluebirdPromise.map(packageData, it => exec("yarn", ["info", "--json", it.name, "dist-tags"])
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
  for (let i = 0; i < packageData.length; i++) {
    const packageMetadata = packageData[i]
    const packageName = packageMetadata.name
    const versionInfo = versions[i]
    const latestVersion = versionInfo.next || versionInfo.latest
    if (latestVersion == null || packageMetadata.version === latestVersion || semver.lt(latestVersion, packageMetadata.version)) {
      continue
    }

    packageMetadata.version = latestVersion
    console.log(`Set ${packageName} version to ${latestVersion}`)
    await writeJson(path.join(packageDir, packageName, "package.json"), packageMetadata, {spaces: 2})
  }
}

async function setDepVersions(packageData: Array<any>) {
  const versions = packageData.map(it => it.version)
  for (const packageMetadata of packageData) {
    const packageName = packageMetadata.name
    let changed = false
    for (let depIndex = 0; depIndex < packageData.length; depIndex++) {
      const depPackageName = packageData[depIndex].name
      for (const depType of ["dependencies", "peerDependencies"]) {
        let oldVersion = packageMetadata[depType] == null ? null : packageMetadata[depType][depPackageName]
        if (oldVersion == null) {
          continue
        }

        let range = ""
        if (oldVersion.startsWith("~") || oldVersion.startsWith("^")) {
          range = oldVersion[0]
          oldVersion = oldVersion.substring(1)
        }

        const newVersion = versions[depIndex]
        if (oldVersion === newVersion || newVersion === "0.0.0-semantic-release") {
          console.log(`Skip ${depPackageName} for ${packageName} — version ${newVersion} is actual`)
          continue
        }

        changed = true
        packageMetadata[depType][depPackageName] = range + newVersion
        console.log(`Set ${depPackageName} to ${newVersion} from ${oldVersion} for ${packageName}`)
      }
    }

    if (changed) {
      await writeJson(path.join(packageDir, packageName, "package.json"), packageMetadata, {spaces: 2})
    }
  }
}

main()
  .catch(printErrorAndExit)