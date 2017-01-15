import * as path from "path"
import { readJson, readFile } from "fs-extra-p"
import { Config } from "../metadata"
import { safeLoad } from "js-yaml"
import { warn, log } from "electron-builder-util/out/log"

const normalizeData = require("normalize-package-data")

export async function readPackageJson(file: string): Promise<any> {
  const data = await readJson(file)
  await authors(file, data)
  normalizeData(data)
  return data
}

async function authors(file: string, data: any) {
  if (data.contributors != null) {
    return
  }

  let authorData
  try {
    authorData = await readFile(path.resolve(path.dirname(file), "AUTHORS"), "utf8")
  }
  catch (ignored) {
    return
  }

  data.contributors = authorData
    .split(/\r?\n/g)
    .map(it => it.replace(/^\s*#.*$/, "").trim())
}

export async function loadConfig(projectDir: string): Promise<Config> {
  try {
    const configPath = path.join(projectDir, "electron-builder.yml")
    const result = safeLoad(await readFile(configPath, "utf8"))
    log(`Using ${path.relative(projectDir, configPath)} configuration file`)
    return result
  }
  catch (e) {
    if (e.code !== "ENOENT") {
      throw e
    }
  }

  const metadata = await readPackageJson(path.join(projectDir, "package.json"))
  if (metadata.directories != null) {
    warn(`"directories" in the root is deprecated, please specify in the "build"`)
    if (metadata.build == null) {
      metadata.build = {directories: metadata.directories}
    }
    else if (metadata.build.directories == null) {
      metadata.build.directories = metadata.directories
    }
    delete metadata.directories
  }
  return metadata.build
}

export async function getElectronVersion(config: Config | null | undefined, projectDir: string): Promise<string> {
  // build is required, but this check is performed later, so, we should check for null
  if (config != null && config.electronVersion != null) {
    return config.electronVersion
  }

  for (const name of ["electron", "electron-prebuilt", "electron-prebuilt-compile"]) {
    try {
      return (await readJson(path.join(projectDir, "node_modules", name, "package.json"))).version
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        warn(`Cannot read electron version from ${name} package.json: ${e.message}`)
      }
    }
  }

  const packageJsonPath = path.join(projectDir, "package.json")
  const electronPrebuiltDep = findFromElectronPrebuilt(await readJson(packageJsonPath))
  if (electronPrebuiltDep == null) {
    throw new Error(`Cannot find electron dependency to get electron version in the '${packageJsonPath}'`)
  }

  const firstChar = electronPrebuiltDep[0]
  return firstChar === "^" || firstChar === "~" ? electronPrebuiltDep.substring(1) : electronPrebuiltDep
}

function findFromElectronPrebuilt(packageData: any): any {
  for (const name of ["electron", "electron-prebuilt", "electron-prebuilt-compile"]) {
    const devDependencies = packageData.devDependencies
    let dep = devDependencies == null ? null : devDependencies[name]
    if (dep == null) {
      const dependencies = packageData.dependencies
      dep = dependencies == null ? null : dependencies[name]
    }
    if (dep != null) {
      return dep
    }
  }
  return null
}