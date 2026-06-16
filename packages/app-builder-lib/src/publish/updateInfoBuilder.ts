import asyncPool from "tiny-async-pool"
import { Arch, log, safeStringifyJson, serializeToYaml } from "builder-util"
import { GenericServerOptions, PublishConfiguration, UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import fsExtra from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import * as semver from "semver"
import { Platform } from "../core.js"
import { ReleaseInfo } from "../options/PlatformSpecificBuildOptions.js"
import { Metadata } from "../options/metadata.js"
import { Packager } from "../packager.js"
import { ArtifactCreated } from "../packagerApi.js"
import { PlatformPackager } from "../platformPackager.js"
import { hashFile } from "../util/hash.js"
import { computeDownloadUrl, getPublishConfigsForUpdateInfo } from "./PublishManager.js"

// electron-updater versions below this floor consume the deprecated top-level
// `path` / `sha512` / `sha2` fields and the `<channel>-mac.json` artifact. When
// the installed updater is at or above this version (or absent), v27 emits the
// modern files[] format only.
const LEGACY_UPDATER_FLOOR = "4.0.0"

async function getReleaseInfo(packager: PlatformPackager<any>) {
  const releaseInfo: ReleaseInfo = { ...(packager.platformOptions.releaseInfo || packager.config.releaseInfo) }
  if (releaseInfo.releaseNotes == null) {
    const releaseNotesFile = await packager.getResource(
      releaseInfo.releaseNotesFile,
      `release-notes-${packager.platform.buildConfigurationKey}.md`,
      `release-notes-${packager.platform.name}.md`,
      `release-notes-${packager.platform.nodeName}.md`,
      "release-notes.md"
    )
    const releaseNotes = releaseNotesFile == null ? null : await fsExtra.readFile(releaseNotesFile, "utf-8")
    // to avoid undefined in the file, check for null
    if (releaseNotes != null) {
      releaseInfo.releaseNotes = releaseNotes
    }
  }
  delete releaseInfo.releaseNotesFile
  return releaseInfo
}

function isGenerateUpdatesFilesForAllChannels(packager: PlatformPackager<any>) {
  const value = packager.platformOptions.generateUpdatesFilesForAllChannels
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
  readonly arch?: Arch | null
}

// Emit the "legacy electron-updater detected" warning at most once per build,
// even when multiple platforms / artifacts trigger update-info generation.
const legacyUpdaterWarnedMetadata = new WeakSet<object>()

/**
 * Resolve the electron-updater range from the app's `package.json#dependencies`.
 * Returns the minimum version implied by the range (e.g. `"^3.0.0"` → `3.0.0`),
 * or `null` when the dep is absent or the range is unparseable.
 */
function resolveUpdaterMinVersion(metadata: Metadata): semver.SemVer | null {
  const range = metadata.dependencies?.["electron-updater"]
  if (range == null) {
    return null
  }
  try {
    return semver.minVersion(range)
  } catch {
    return null
  }
}

/**
 * `true` when the app declares electron-updater at a version below
 * {@link LEGACY_UPDATER_FLOOR}. The first time this returns `true` for a given
 * Metadata instance, a one-shot upgrade-recommendation warning is emitted.
 *
 * Missing dep, range >= floor, or unparseable range → `false` (no legacy
 * fields, no warning).
 */
function shouldWriteLegacyUpdaterCompat(packager: PlatformPackager<any>): boolean {
  const metadata = packager.metadata
  const min = resolveUpdaterMinVersion(metadata)
  if (min == null || semver.gte(min, LEGACY_UPDATER_FLOOR)) {
    return false
  }
  if (!legacyUpdaterWarnedMetadata.has(metadata)) {
    legacyUpdaterWarnedMetadata.add(metadata)
    log.warn(
      {
        detected: min.version,
        recommended: `>= ${LEGACY_UPDATER_FLOOR}`,
      },
      "legacy electron-updater (< 4.0.0) detected in package.json dependencies. The deprecated top-level path/sha512/sha2 fields and the <channel>-mac.json artifact will be removed in a future major release. Upgrade electron-updater to continue receiving updates."
    )
  }
  return true
}

export async function createUpdateInfoTasks(event: ArtifactCreated, _publishConfigs: Array<PublishConfiguration>): Promise<Array<UpdateInfoFileTask>> {
  const packager = event.packager
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, _publishConfigs, event.arch)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return []
  }

  const outDir = event.target!.outDir
  const version = packager.appInfo.version
  const sha2 = new Lazy<string>(() => hashFile(event.file, "sha256", "hex"))
  const isMac = packager.platform === Platform.MAC
  const createdFiles = new Set<string>()
  const legacyCompat = shouldWriteLegacyUpdaterCompat(packager)
  const sharedInfo = await createUpdateInfo(version, event, await getReleaseInfo(packager), legacyCompat)
  const tasks: Array<UpdateInfoFileTask> = []
  let macLegacyJsonWritten = false
  for (const publishConfiguration of publishConfigs) {
    let dir = outDir
    if (publishConfigs.length > 1 && publishConfiguration !== publishConfigs[0]) {
      dir = path.join(outDir, publishConfiguration.provider)
    }

    let info = sharedInfo
    if (legacyCompat && packager.platform === Platform.WINDOWS) {
      // noinspection JSDeprecatedSymbols
      info = { ...info }
      // noinspection JSDeprecatedSymbols
      ;(info as WindowsUpdateInfo).sha2 = await sha2.value
    }

    if (event.safeArtifactName != null && publishConfiguration.provider === "github") {
      const newFiles = info.files.slice()
      newFiles[0].url = event.safeArtifactName
      info = {
        ...info,
        files: newFiles,
        ...(legacyCompat
          ? {
              // noinspection JSDeprecatedSymbols
              path: event.safeArtifactName,
            }
          : {}),
      }
    }

    for (const channel of computeChannelNames(packager, publishConfiguration)) {
      if (isMac && legacyCompat && !macLegacyJsonWritten && event.file.endsWith(".zip")) {
        // Write the legacy <channel>-mac.json once per build (generateUpdatesFilesForAllChannels
        // was added long after the legacy reader existed, so it only needs one channel's worth).
        macLegacyJsonWritten = true
        await writeOldMacInfo(publishConfiguration, outDir, dir, channel, createdFiles, version, packager)
      }

      const updateInfoFile = path.join(dir, getUpdateInfoFileName(channel, packager, event.arch))
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
        arch: event.arch,
      })
    }
  }
  return tasks
}

async function createUpdateInfo(version: string, event: ArtifactCreated, releaseInfo: ReleaseInfo, legacyCompat: boolean): Promise<UpdateInfo> {
  const customUpdateInfo = event.updateInfo
  const url = path.basename(event.file)
  const sha512 = (customUpdateInfo == null ? null : customUpdateInfo.sha512) || (await hashFile(event.file))
  const files = [{ url, sha512 }]
  const result: UpdateInfo = {
    // @ts-ignore
    version,
    // @ts-ignore
    files,
    ...(legacyCompat
      ? {
          // noinspection JSDeprecatedSymbols
          path: url,
          // noinspection JSDeprecatedSymbols
          sha512,
        }
      : {}),
    ...(releaseInfo as UpdateInfo),
  }

  if (customUpdateInfo != null) {
    // file info or nsis web installer packages info
    Object.assign("sha512" in customUpdateInfo ? files[0] : result, customUpdateInfo)
  }
  return result
}

export async function writeUpdateInfoFiles(updateInfoFileTasks: Array<UpdateInfoFileTask>, packager: Packager) {
  // zip must be first and zip info must be used for old path/sha512 properties in the update info
  // universal installer (arch === null) must precede arch-specific ones so path:/sha512: point to the right artifact
  updateInfoFileTasks.sort((a, b) => {
    const zipDiff = (a.info.files[0].url.endsWith(".zip") ? 0 : 100) - (b.info.files[0].url.endsWith(".zip") ? 0 : 100)
    if (zipDiff !== 0) {
      return zipDiff
    }
    // universal (arch === null) before arch-specific; tie-break by Arch enum value for full determinism
    // undefined arch (external callers predating this field) treated as arch-specific via strict === null check
    const aArch = a.arch === null ? -1 : (a.arch ?? Number.MAX_SAFE_INTEGER)
    const bArch = b.arch === null ? -1 : (b.arch ?? Number.MAX_SAFE_INTEGER)
    return aArch - bArch
  })

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
  const concurrency = 4
  await asyncPool<UpdateInfoFileTask, void>(concurrency, Array.from(updateChannelFileToInfo.values()), async task => {
    const publishConfig = task.publishConfiguration
    if (publishConfig.publishAutoUpdate === false) {
      log.debug(
        {
          provider: publishConfig.provider,
          reason: "publishAutoUpdate is set to false",
        },
        "auto update metadata file not published"
      )
      return
    }

    if (task.info.releaseDate == null) {
      task.info.releaseDate = releaseDate
    }

    const fileContent = Buffer.from(serializeToYaml(task.info, false, true))
    await fsExtra.outputFile(task.file, fileContent)
    await packager.emitArtifactCreated({
      file: task.file,
      fileContent,
      arch: null,
      packager: task.packager,
      target: null,
      publishConfig,
    })
  })
}

// backward compatibility - write json file
async function writeOldMacInfo(
  publishConfig: PublishConfiguration,
  outDir: string,
  dir: string,
  channel: string,
  createdFiles: Set<string>,
  version: string,
  packager: PlatformPackager<any>
) {
  const isGitHub = publishConfig.provider === "github"
  const updateInfoFile = isGitHub && outDir === dir ? path.join(dir, "github", `${channel}-mac.json`) : path.join(dir, `${channel}-mac.json`)
  if (!createdFiles.has(updateInfoFile)) {
    createdFiles.add(updateInfoFile)
    await fsExtra.outputJson(
      updateInfoFile,
      {
        version,
        releaseDate: new Date().toISOString(),
        url: computeDownloadUrl(publishConfig, packager.generateName2("zip", "mac", isGitHub), packager),
      },
      { spaces: 2 }
    )

    await packager.emitArtifactCreated({
      file: updateInfoFile,
      arch: null,
      packager,
      target: null,
      publishConfig,
    })
  }
}
