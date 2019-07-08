import BluebirdPromise from "bluebird-lst"
import { Arch, log, safeStringifyJson, serializeToYaml } from "builder-util"
import { GenericServerOptions, PublishConfiguration, UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import { outputFile, outputJson, readFile } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import * as semver from "semver"
import { ReleaseInfo } from ".."
import { Platform } from "../core"
import { Packager } from "../packager"
import { ArtifactCreated } from "../packagerApi"
import { PlatformPackager } from "../platformPackager"
import { hashFile } from "../util/hash"
import { computeDownloadUrl, getPublishConfigsForUpdateInfo } from "./PublishManager"

async function getReleaseInfo(packager: PlatformPackager<any>) {
  const releaseInfo: ReleaseInfo = {...(packager.platformSpecificBuildOptions.releaseInfo || packager.config.releaseInfo)}
  if (releaseInfo.releaseNotes == null) {
    const releaseNotesFile = await packager.getResource(releaseInfo.releaseNotesFile, `release-notes-${packager.platform.buildConfigurationKey}.md`, `release-notes-${packager.platform.name}.md`, `release-notes-${packager.platform.nodeName}.md`, "release-notes.md")
    const releaseNotes = releaseNotesFile == null ? null : await readFile(releaseNotesFile, "utf-8")
    // to avoid undefined in the file, check for null
    if (releaseNotes != null) {
      releaseInfo.releaseNotes = releaseNotes
    }
  }
  delete releaseInfo.releaseNotesFile
  return releaseInfo
}

function isGenerateUpdatesFilesForAllChannels(packager: PlatformPackager<any>) {
  const value = packager.platformSpecificBuildOptions.generateUpdatesFilesForAllChannels
  return value == null ? packager.config.generateUpdatesFilesForAllChannels : value
}

/**
 if this is an "alpha" version, we need to generate only the "alpha" .yml file
 if this is a "beta" version, we need to generate both the "alpha" and "beta" .yml file
 if this is a "stable" version, we need to generate all the "alpha", "beta" and "stable" .yml file
 */
function computeChannelNames(packager: PlatformPackager<any>, publishConfig: PublishConfiguration): Array<string> {
  const currentChannel: string = (publishConfig as GenericServerOptions).channel || "latest"
  // for GitHub should be pre-release way be used
  if (currentChannel === "alpha" || publishConfig.provider === "github" || !isGenerateUpdatesFilesForAllChannels(packager)) {
    return [currentChannel]
  }

  switch (currentChannel) {
    case "beta":
      return [currentChannel, "alpha"]

    case "latest":
      return [currentChannel, "alpha", "beta"]

    default:
      return [currentChannel]
  }
}

function getUpdateInfoFileName(channel: string, packager: PlatformPackager<any>, arch: Arch | null): string {
  const osSuffix = packager.platform === Platform.WINDOWS ? "" : `-${packager.platform.buildConfigurationKey}`
  return `${channel}${osSuffix}${getArchPrefixForUpdateFile(arch, packager)}.yml`
}

function getArchPrefixForUpdateFile(arch: Arch | null, packager: PlatformPackager<any>) {
  if (arch == null || arch === Arch.x64 || packager.platform !== Platform.LINUX) {
    return ""
  }
  return arch === Arch.armv7l ? "-arm" : `-${Arch[arch]}`
}

export interface UpdateInfoFileTask {
  readonly file: string
  readonly info: UpdateInfo
  readonly publishConfiguration: PublishConfiguration

  readonly packager: PlatformPackager<any>
}

function computeIsisElectronUpdater1xCompatibility(updaterCompatibility: string | null, publishConfiguration: PublishConfiguration, packager: Packager) {
  if (updaterCompatibility != null) {
    return semver.satisfies("1.0.0", updaterCompatibility)
  }

  // spaces is a new publish provider, no need to keep backward compatibility
  if (publishConfiguration.provider === "spaces") {
    return false
  }

  const updaterVersion = packager.metadata.dependencies == null ? null : packager.metadata.dependencies["electron-updater"]
  return updaterVersion == null || semver.lt(updaterVersion, "4.0.0")
}

/** @internal */
export async function createUpdateInfoTasks(event: ArtifactCreated, _publishConfigs: Array<PublishConfiguration>): Promise<Array<UpdateInfoFileTask>> {
  const packager = event.packager
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, _publishConfigs, event.arch)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return []
  }

  const outDir = event.target!.outDir
  const version = packager.appInfo.version
  const sha2 = new Lazy<string>(() => hashFile(event.file!, "sha256", "hex"))
  const isMac = packager.platform === Platform.MAC
  const createdFiles = new Set<string>()
  const sharedInfo = await createUpdateInfo(version, event, await getReleaseInfo(packager))
  const tasks: Array<UpdateInfoFileTask> = []
  const electronUpdaterCompatibility = packager.platformSpecificBuildOptions.electronUpdaterCompatibility || packager.config.electronUpdaterCompatibility || ">=2.15"
  for (const publishConfiguration of publishConfigs) {
    const isBintray = publishConfiguration.provider === "bintray"
    let dir = outDir
    // Bintray uses different variant of channel file info, better to generate it to a separate dir by always
    if (isBintray || (publishConfigs.length > 1 && publishConfiguration !== publishConfigs[0])) {
      dir = path.join(outDir, publishConfiguration.provider)
    }

    let isElectronUpdater1xCompatibility = computeIsisElectronUpdater1xCompatibility(electronUpdaterCompatibility, publishConfiguration, packager.info)

    let info = sharedInfo
    // noinspection JSDeprecatedSymbols
    if (isElectronUpdater1xCompatibility && packager.platform === Platform.WINDOWS) {
      info = {
        ...info,
      };
      // noinspection JSDeprecatedSymbols
      (info as WindowsUpdateInfo).sha2 = await sha2.value
    }

    if (event.safeArtifactName != null && publishConfiguration.provider === "github") {
      const newFiles = info.files.slice()
      newFiles[0].url = event.safeArtifactName
      info = {
        ...info,
        files: newFiles,
        path: event.safeArtifactName,
      }
    }

    for (const channel of computeChannelNames(packager, publishConfiguration)) {
      if (isMac && isElectronUpdater1xCompatibility && event.file.endsWith(".zip")) {
        // write only for first channel (generateUpdatesFilesForAllChannels is a new functionality, no need to generate old mac update info file)
        isElectronUpdater1xCompatibility = false
        await writeOldMacInfo(publishConfiguration, outDir, dir, channel, createdFiles, version, packager)
      }

      const updateInfoFile = path.join(dir, (isBintray ? `${version}_` : "") + getUpdateInfoFileName(channel, packager, event.arch))
      if (createdFiles.has(updateInfoFile)) {
        continue
      }

      createdFiles.add(updateInfoFile)

      // artifact should be uploaded only to designated publish provider
      tasks.push({
        file: updateInfoFile,
        info,
        publishConfiguration,
        packager,
      })
    }
  }
  return tasks
}

async function createUpdateInfo(version: string, event: ArtifactCreated, releaseInfo: ReleaseInfo): Promise<UpdateInfo> {
  const customUpdateInfo = event.updateInfo
  const url = path.basename(event.file!)
  const sha512 = (customUpdateInfo == null ? null : customUpdateInfo.sha512) || await hashFile(event.file!)
  const files = [{url, sha512}]
  const result: UpdateInfo = {
    version,
    files,
    path: url /* backward compatibility, electron-updater 1.x - electron-updater 2.15.0 */,
    sha512 /* backward compatibility, electron-updater 1.x - electron-updater 2.15.0 */,
    ...releaseInfo as UpdateInfo,
  }

  if (customUpdateInfo != null) {
    // file info or nsis web installer packages info
    Object.assign("sha512" in customUpdateInfo ? files[0] : result, customUpdateInfo)
  }
  return result
}

export async function writeUpdateInfoFiles(updateInfoFileTasks: Array<UpdateInfoFileTask>, packager: Packager) {
  // zip must be first and zip info must be used for old path/sha512 properties in the update info
  updateInfoFileTasks.sort((a, b) => (a.info.files[0].url.endsWith(".zip") ? 0 : 100) - (b.info.files[0].url.endsWith(".zip") ? 0 : 100))

  const updateChannelFileToInfo = new Map<string, UpdateInfoFileTask>()
  for (const task of updateInfoFileTasks) {
    // https://github.com/electron-userland/electron-builder/pull/2994
    const key = `${task.file}@${safeStringifyJson(task.publishConfiguration, new Set(["releaseType"]))}`
    const existingTask = updateChannelFileToInfo.get(key)
    if (existingTask == null) {
      updateChannelFileToInfo.set(key, task)
      continue
    }

    existingTask.info.files.push(...task.info.files)
  }

  const releaseDate = new Date().toISOString()
  await BluebirdPromise.map(updateChannelFileToInfo.values(), async task => {
    const publishConfig = task.publishConfiguration
    if (publishConfig.publishAutoUpdate === false) {
      log.debug({
        provider: publishConfig.provider,
        reason: "publishAutoUpdate is set to false"
      }, "auto update metadata file not published")
      return
    }

    if (task.info.releaseDate == null) {
      task.info.releaseDate = releaseDate
    }

    const fileContent = Buffer.from(serializeToYaml(task.info, false, true))
    await outputFile(task.file, fileContent)
    packager.dispatchArtifactCreated({
      file: task.file,
      fileContent,
      arch: null,
      packager: task.packager,
      target: null,
      publishConfig,
    })
  }, {concurrency: 4})
}

// backward compatibility - write json file
async function writeOldMacInfo(publishConfig: PublishConfiguration, outDir: string, dir: string, channel: string, createdFiles: Set<string>, version: string, packager: PlatformPackager<any>) {
  const isGitHub = publishConfig.provider === "github"
  const updateInfoFile = (isGitHub && outDir === dir) ? path.join(dir, "github", `${channel}-mac.json`) : path.join(dir, `${channel}-mac.json`)
  if (!createdFiles.has(updateInfoFile)) {
    createdFiles.add(updateInfoFile)
    await outputJson(updateInfoFile, {
      version,
      releaseDate: new Date().toISOString(),
      url: computeDownloadUrl(publishConfig, packager.generateName2("zip", "mac", isGitHub), packager),
    }, {spaces: 2})

    packager.info.dispatchArtifactCreated({
      file: updateInfoFile,
      arch: null,
      packager,
      target: null,
      publishConfig,
    })
  }
}
