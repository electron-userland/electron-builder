const BluebirdPromise = require("bluebird-lst")
const path = require("path")
const fs = require("fs-extra")

async function main() {
  const rootDeps = (await fs.readJson(path.join(__dirname, "..", "package.json"))).dependencies
  return await BluebirdPromise.map(require("./process").getPackages(), async projectDir => {
    if (projectDir.includes("electron-forge-maker-")) {
      return
    }

    const packageFile = path.join(projectDir, "package.json")
    const packageData = await fs.readJson(packageFile)
    const deps = packageData.dependencies
    if (deps == null) {
      return
    }

    let changed = false
    for (const name of Object.keys(deps)) {
      if (name.startsWith("electron-builder-") || name === "electron-publish" || name.endsWith("-builder") || name.startsWith("builder-") || name === "app-builder-lib") {
        continue
      }

      const rootVersion = rootDeps[name]
      if (rootVersion == null) {
        throw new Error(`Dependency ${name} not listed in the root package.json but listed in the${path.relative(__dirname, packageFile)}`)
      }

      if (deps[name] !== rootVersion) {
        deps[name] = rootVersion
        console.log(`Set ${name} to ${rootVersion} in ${path.relative(__dirname, packageFile)}`)
        changed = true
      }
    }

    if (changed && Object.keys(packageData).length !== 0) {
      return await fs.writeJson(packageFile, packageData, {spaces: 2})
    }
  })
}

main()
  .catch(error => {
    console.error((error.stack || error).toString())
    process.exit(-1)
  })