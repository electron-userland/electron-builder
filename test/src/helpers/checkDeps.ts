import chalk from "chalk"
import depCheck, { Results } from "depcheck"
import { readJson } from "fs-extra"
import { promises as fs } from "fs"
import * as path from "path"
import { printErrorAndExit } from "builder-util/out/promise"

const knownUnusedDevDependencies = new Set<string>([
])

const knownMissedDependencies = new Set<string>([
  "babel-core",
  "babel-preset-env",
  "babel-preset-stage-0",
  "babel-preset-react",
])

const rootDir = path.join(__dirname, "../../..")
const packageDir = path.join(rootDir, "packages")

async function check(projectDir: string, devPackageData: any): Promise<boolean> {
  const packageName = path.basename(projectDir)
  // console.log(`Checking ${projectDir}`)

  const result = await new Promise<Results>(resolve => {
    depCheck(projectDir, {
      ignoreDirs: [
        "src", "test", "docs", "typings", "docker", "certs", "templates", "vendor",
      ],
      // ignore d.ts
      parsers: {
        "*.js": (depCheck as any).parser.es6,
      },
    }, resolve)
  })

  let unusedDependencies: any
  if (packageName === "electron-builder") {
    unusedDependencies = result.dependencies.filter(it => it !== "dmg-builder" && it !== "bluebird-lst" && it !== "@types/yargs")
  }
  else {
    unusedDependencies = result.dependencies.filter(it => it !== "bluebird-lst" && it !== "@types/debug" && it !== "@types/semver" && it !== "@types/fs-extra")
  }

  if (unusedDependencies.length > 0) {
    console.error(`${chalk.bold(packageName)} Unused dependencies: ${JSON.stringify(unusedDependencies, null, 2)}`)
    return false
  }

  let unusedDevDependencies = result.devDependencies.filter(it => !it.startsWith("@types/") && !knownUnusedDevDependencies.has(it))
  if (packageName === "dmg-builder") {
    unusedDevDependencies = unusedDevDependencies.filter(it => it !== "temp-file")
  }
  if (unusedDevDependencies.length > 0) {
    console.error(`${chalk.bold(packageName)} Unused devDependencies: ${JSON.stringify(unusedDevDependencies, null, 2)}`)
    return false
  }

  delete (result.missing as any).electron
  const toml = (result.missing as any).toml
  if (toml != null && toml.length === 1 && toml[0].endsWith("config.js")) {
    delete (result.missing as any).toml
  }

  for (const name of Object.keys(result.missing)) {
    if (name === "electron-builder-squirrel-windows" || name === "electron-webpack" ||
      (packageName === "app-builder-lib" && (name === "dmg-builder" || knownMissedDependencies.has(name) || name.startsWith("@babel/"))) ||
      (packageName === "app-builder-lib" && (name === "dmg-builder" || knownMissedDependencies.has(name) || name.startsWith("@babel/")))) {
      delete (result.missing as any)[name]
    }
  }

  if (Object.keys(result.missing).length > 0) {
    console.error(`${chalk.bold(packageName)} Missing dependencies: ${JSON.stringify(result.missing, null, 2)}`)
    return false
  }

  const packageData = await readJson(path.join(projectDir, "package.json"))
  for (const name of (devPackageData.devDependencies == null ? [] : Object.keys(devPackageData.devDependencies))) {
    if (packageData.dependencies != null && packageData.dependencies[name] != null) {
      continue
    }

    const usages = result.using[name]
    if (usages == null || usages.length === 0) {
      continue
    }

    for (const file of usages) {
      if (file.startsWith(path.join(projectDir, "src") + path.sep)) {
        console.error(`${chalk.bold(packageName)} Dev dependency ${name} is used in the sources`)
        return false
      }
    }
  }

  return true
}

async function main(): Promise<void> {
  const packages = (await fs.readdir(packageDir)).filter(it => !it.includes(".")).sort()
  const devPackageData = await readJson(path.join(rootDir, "package.json"))
  if ((await Promise.all(packages.map(it => check(path.join(packageDir, it), devPackageData)))).includes(false)) {
    process.exitCode = 1
  }
}

main()
  .catch(printErrorAndExit)