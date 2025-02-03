const chalk = require("chalk")
const depCheck = require("depcheck")
const fs = require("fs-extra")
const path = require("path")
const knownUnusedDevDependencies = new Set([
  "@babel/plugin-transform-modules-commonjs", // Not sure what this is used for, but keeping just in case (for now)
  "@changesets/changelog-github", // Used in package.json CI/CD logic
  "typedoc-plugin-markdown", // Used in typedoc config
  // Eslint config doesn't get scanned by depCheck
  "@stylistic/eslint-plugin",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "eslint-config-prettier",
  "eslint-plugin-prettier",
  "@rollup/plugin-typescript",
])
const knownMissedDependencies = new Set(["babel-core", "babel-preset-env", "babel-preset-stage-0", "babel-preset-react"])

const rootDir = path.join(__dirname, "..")
const packageDir = path.join(rootDir, "packages")

async function check(projectDir, devPackageData) {
  const packageName = path.basename(projectDir)
  // console.log(`Checking ${projectDir}`)

  const result = await new Promise(resolve => {
    depCheck(projectDir, { ignoreDirs: ["out", "test", "pages", "typings", "docker", "certs", "templates", "vendor"] }, resolve)
  })

  let unusedDependencies = result.dependencies
  if (unusedDependencies.length > 0) {
    // Check root for unused deps (which could be cloned to any folder name, so we check basename of cwd)
    if (packageName === path.basename(process.cwd())) {
      unusedDependencies = unusedDependencies.filter(it => it !== "dmg-license")
    }
    if (packageName === "electron-builder") {
      unusedDependencies = unusedDependencies.filter(it => it !== "dmg-builder")
    }
    if (unusedDependencies.length > 0) {
      console.error(`${chalk.bold(packageName)} Unused dependencies: ${JSON.stringify(unusedDependencies, null, 2)}`)
      return false
    }
  }

  let unusedDevDependencies = result.devDependencies.filter(it => !it.startsWith("@types/") && !knownUnusedDevDependencies.has(it))
  if (packageName === "dmg-builder") {
    unusedDevDependencies = unusedDevDependencies.filter(it => it !== "temp-file")
  }
  if (unusedDevDependencies.length > 0) {
    console.error(`${chalk.bold(packageName)} Unused devDependencies: ${JSON.stringify(unusedDevDependencies, null, 2)}`)
    return false
  }

  delete result.missing.electron
  const toml = result.missing.toml
  if (toml != null && toml.length === 1 && toml[0].endsWith("config.js")) {
    delete result.missing.toml
  }

  if (packageName === "electron-builder") {
    delete result.missing["electron-publish"]
  }

  for (const name of Object.keys(result.missing)) {
    if (
      name === "electron-builder-squirrel-windows" ||
      name === "electron-webpack" ||
      (packageName === "app-builder-lib" && (name === "dmg-builder" || knownMissedDependencies.has(name) || name.startsWith("@babel/")))
    ) {
      delete result.missing[name]
    }
  }

  if (Object.keys(result.missing).length > 0) {
    console.error(`${chalk.bold(packageName)} Missing dependencies: ${JSON.stringify(result.missing, null, 2)}`)
    return false
  }

  const packageData = await fs.readJson(path.join(projectDir, "package.json"))
  for (const name of devPackageData.devDependencies == null ? [] : Object.keys(devPackageData.devDependencies)) {
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

async function main() {
  const packages = (await fs.readdir(packageDir)).filter(it => !it.includes(".")).sort()
  const devPackageData = await fs.readJson(path.join(rootDir, "package.json"))
  const checkRoot = await check(process.cwd(), devPackageData)
  const checkPackages = await Promise.all(packages.map(it => check(path.join(packageDir, it), devPackageData)))
  if (checkRoot === false || checkPackages.includes(false)) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(chalk.red((error.stack || error).toString()))
  process.exit(1)
})
