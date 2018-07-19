import { log } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { readJson } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { orNullIfFileNotExist } from "read-config-file"
import { Configuration } from "../configuration"
import { getConfig } from "../util/config"
import { versionFromDependencyRange } from "../util/packageMetadata"

export type MetadataValue = Lazy<{ [key: string]: any } | null>

export async function getElectronVersion(projectDir: string, config?: Configuration, projectMetadata: MetadataValue = new Lazy(() => orNullIfFileNotExist(readJson(path.join(projectDir, "package.json"))))): Promise<string> {
  if (config == null) {
    config = await getConfig(projectDir, null, null)
  }
  if (config.electronVersion != null) {
    return config.electronVersion
  }
  return await computeElectronVersion(projectDir, projectMetadata)
}

export async function getElectronVersionFromInstalled(projectDir: string) {
  for (const name of ["electron", "electron-prebuilt", "electron-prebuilt-compile"]) {
    try {
      return (await readJson(path.join(projectDir, "node_modules", name, "package.json"))).version
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        log.warn({name, error: e}, `cannot read electron version package.json`)
      }
    }
  }
  return null
}

/** @internal */
export async function computeElectronVersion(projectDir: string, projectMetadata: MetadataValue): Promise<string> {
  const result = await getElectronVersionFromInstalled(projectDir)
  if (result != null) {
    return result
  }

  const electronPrebuiltDep = findFromElectronPrebuilt(await projectMetadata!!.value)
  if (electronPrebuiltDep == null || electronPrebuiltDep === "latest") {
    try {
      const releaseInfo = JSON.parse((await httpExecutor.request({
        hostname: "github.com",
        path: "/electron/electron/releases/latest",
        headers: {
          accept: "application/json",
        },
      }))!!)
      return (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      log.warn(e)
    }

    throw new Error(`Cannot find electron dependency to get electron version in the '${path.join(projectDir, "package.json")}'`)
  }

  return versionFromDependencyRange(electronPrebuiltDep)
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