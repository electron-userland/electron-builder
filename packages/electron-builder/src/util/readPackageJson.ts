import Ajv from "ajv"
import { log, warn } from "electron-builder-util/out/log"
import { readFile, readJson } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { readAsarJson } from "../asar"
import { Config } from "../metadata"
import AdditionalPropertiesParams = ajv.AdditionalPropertiesParams
import ErrorObject = ajv.ErrorObject
import TypeParams = ajv.TypeParams

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

function getConfigFromPackageData(metadata: any) {
  if (metadata.directories != null) {
    throw new Error(`"directories" in the root is deprecated, please specify in the "build"`)
  }
  return metadata.build
}

export async function doLoadConfig(configFile: string, projectDir: string) {
  const result = safeLoad(await readFile(configFile, "utf8"))
  const relativePath = path.relative(projectDir, configFile)
  log(`Using ${relativePath.startsWith("..") ? configFile : relativePath} configuration file`)
  return result
}

export async function loadConfig(projectDir: string): Promise<Config | null> {
  for (const configFile of ["electron-builder.yml", "electron-builder.json", "electron-builder.json5"]) {
    try {
      return await doLoadConfig(path.join(projectDir, configFile), projectDir)
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        throw e
      }
    }
  }

  try {
    return getConfigFromPackageData(await readPackageJson(path.join(projectDir, "package.json")))
  }
  catch (e) {
    if (e.code !== "ENOENT") {
      throw e
    }

    try {
      const data = await readAsarJson(path.join(projectDir, "app.asar"), "package.json")
      if (data != null) {
        return getConfigFromPackageData(data)
      }
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        throw e
      }
    }

    throw new Error(`Cannot find package.json in the ${projectDir}`)
  }
}

export async function getElectronVersion(config: Config | null | undefined, projectDir: string, projectMetadata?: any | null): Promise<string> {
  // build is required, but this check is performed later, so, we should check for null
  if (config != null && config.electronVersion != null) {
    return config.electronVersion
  }

  // projectMetadata passed only for prepacked app asar and in this case no dev deps in the app.asar
  if (projectMetadata == null) {
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
  }

  const packageJsonPath = path.join(projectDir, "package.json")
  const electronPrebuiltDep = findFromElectronPrebuilt(projectMetadata || await readJson(packageJsonPath))
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

let validatorPromise: Promise<any> | null = null

async function createConfigValidator() {
  const ajv = new Ajv({allErrors: true})
  ajv.addMetaSchema(require("ajv/lib/refs/json-schema-draft-04.json"))
  require("ajv-keywords")(ajv, ["typeof"])
  const schema = await readJson(path.join(__dirname, "..", "..", "scheme.json"))
  return ajv.compile(schema)
}

export async function validateConfig(config: Config) {
  if (validatorPromise == null) {
    validatorPromise = createConfigValidator()
  }

  const validator = await validatorPromise
  if (!validator(config)) {
    throw new Error("Config is invalid:\n" + JSON.stringify(normaliseErrorMessages(validator.errors!), null, 2) + "\n\nRaw validation errors: " + JSON.stringify(validator.errors, null, 2))
  }
}

function normaliseErrorMessages(errors: Array<ErrorObject>) {
  const result: any = Object.create(null)
  for (const e of errors) {
    if (e.keyword === "type" && (<TypeParams>e.params).type === "null") {
      // ignore - no sense to report that type accepts null
      continue
    }

    const dataPath = e.dataPath.length === 0 ? [] : e.dataPath.substring(1).split(".")
    if (e.keyword === "additionalProperties") {
      dataPath.push((<AdditionalPropertiesParams>e.params).additionalProperty)
    }

    let o = result
    let lastName: string | null = null
    for (const p of dataPath) {
      if (p === dataPath[dataPath.length - 1]) {
        lastName = p
        break
      }
      else {
        if (o[p] == null) {
          o[p] = Object.create(null)
        }
        else if (typeof o[p] === "string") {
          o[p] = [o[p]]
        }
        o = o[p]
      }
    }

    if (lastName == null) {
      lastName = "unknown"
    }

    let message = e.message!.toUpperCase()[0] + e.message!.substring(1)
    switch (e.keyword) {
      case "additionalProperties":
        message = "Unknown option"
        break

      case "required":
        message = "Required option"
        break

      case "anyOf":
        message = "Invalid option object"
        break
    }

    if (o[lastName] != null && !Array.isArray(o[lastName])) {
      o[lastName] = [o[lastName]]
    }

    if (Array.isArray(o[lastName])) {
      o[lastName].push(message)
    }
    else {
      o[lastName] = message
    }
  }
  return result
}