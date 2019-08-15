import BluebirdPromise from "bluebird-lst"
import { readJson, writeJson } from "fs-extra"
import { promises as fs } from "fs"
import * as path from "path"
import * as semver from "semver"

const printErrorAndExit = require("../../../packages/builder-util/out/promise").printErrorAndExit
const exec = require("../../../packages/builder-util/out/util").exec

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")

async function readProjectMetadata(packageDir: string) {
  const packageDirs = BluebirdPromise.filter((await fs.readdir(packageDir)).filter(it => !it.includes(".")).sort(), it => {
    return fs.stat(path.join(packageDir, it, "package.json"))
      .then(it => it.isFile())
      .catch(() => false)
  })
  return await BluebirdPromise.map(packageDirs, it => readJson(path.join(packageDir, it, "package.json")), {concurrency: 8})
}

async function main(): Promise<void> {
  const packageData = await readProjectMetadata(packageDir)
  const args = process.argv.slice(2)
  if (args.length > 0 && args[0] === "p") {
    await setPackageVersions(packageData)
  }
  else {
    await setPackageVersions(packageData)
    await setDepVersions(packageData)
  }
}

function getLatestVersions(packageData: Array<any>) {
  return BluebirdPromise.map(packageData, packageInfo => {
    return exec(process.platform === "win32" ? "yarn.cmd" : "yarn", ["info", "--json", packageInfo.name, "dist-tags"])
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
      })
      .catch((e: any) => {
        console.log(e)
        return "0.0.1"
      })
  })
}

async function setPackageVersions(packageData: Array<any>) {
  const versions = await getLatestVersions(packageData)
  let publishScript = `#!/usr/bin/env bash
set -e
  
ln -f README.md packages/electron-builder/README.md
`

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

  for (let i = 0; i < packageData.length; i++) {
    const packageMetadata = packageData[i]
    const versionInfo = versions[i]
    const latestVersion = versionInfo.next || versionInfo.latest
    if (latestVersion != null && semver.gt(packageMetadata.version, latestVersion)) {
      publishScript += `npm publish packages/${packageMetadata.name}\n`
    }
  }

  await fs.writeFile(path.join(rootDir, "__publish.sh"), publishScript)
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