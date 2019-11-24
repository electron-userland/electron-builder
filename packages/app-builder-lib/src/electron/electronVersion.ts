import { InvalidConfigurationError, log } from "builder-util"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { readJson } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { orNullIfFileNotExist } from "read-config-file"
import * as semver from "semver"
import { Configuration } from "../configuration"
import { getConfig } from "../util/config"

export type MetadataValue = Lazy<{ [key: string]: any } | null>

const electronPackages = ["electron", "electron-prebuilt", "electron-prebuilt-compile", "electron-nightly"]

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
  for (const name of electronPackages) {
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

export async function getElectronPackage(projectDir: string) {
  for (const name of electronPackages) {
    try {
      return (await readJson(path.join(projectDir, "node_modules", name, "package.json")))
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        log.warn({name, error: e}, `cannot find electron in package.json`)
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

  const electronVersionFromMetadata = findFromPackageMetadata(await projectMetadata!!.value)
  const electronPackageName = findFromPackageMetadata(await projectMetadata!!.value)

  if (electronPackageName === "electron-nightly") {
    log.warn("You are using a nightly version of electron, be warned that those builds are highly unstable.")
    try {
      const releaseInfo = JSON.parse((await httpExecutor.request({
          hostname: "github.com",
          path: "/electron/nightlies/releases/latest",
          headers: {
            accept: "application/json",
          },
      }))!!)
      return (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      log.warn(e)
    }
    throw new InvalidConfigurationError(`Cannot find electron in '${path.join(projectDir, "package.json")}'`)
  }
  else if (electronPackageName === "electron" || electronPackageName === "electron-prebuilt" || electronPackageName === "electron-prebuilt-compile" && electronVersionFromMetadata === "latest") {
    log.warn("Electron version is set to \"latest\", but it is recommended to set it to some more restricted version range.")
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

    throw new InvalidConfigurationError(`Cannot find electron dependency to get electron version in the '${path.join(projectDir, "package.json")}'`)
  }

  if (electronVersionFromMetadata == null || !/^\d/.test(electronVersionFromMetadata)) {
    const versionMessage = electronVersionFromMetadata == null ? "" : ` and version ("${electronVersionFromMetadata}") is not fixed in project`
    throw new InvalidConfigurationError(`Cannot compute electron version from installed node modules - none of the possible electron modules are installed${versionMessage}.\nSee https://github.com/ShadixAced/electron-builder/issues/3984#issuecomment-504968246`)
  }

  return semver.coerce(electronVersionFromMetadata)!!.toString()
}

function findFromPackageMetadata(packageData: any): string | null {
  for (const name of electronPackages) {
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
