import asyncPool from "tiny-async-pool"
import { Arch, log, safeStringifyJson, serializeToYaml } from "builder-util"
import { GenericServerOptions, PublishConfiguration, UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import fsExtra from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import * as semver from "semver"
import { Platform } from "../core.js"
import { ReleaseInfo } from "../options/PlatformSpecificBuildOptions.js"
import { Packager } from "../packager.js"
import { ArtifactCreated } from "../packagerApi.js"
import { PlatformPackager } from "../platformPackager.js"
import { hashFile } from "../util/hash.js"
import { computeDownloadUrl, getPublishConfigsForUpdateInfo } from "./PublishManager.js"

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
  const baseChannel = ["alpha", "beta", "latest"].find(name => currentChannel === name || currentChannel.startsWith(`${name}-`)) || currentChannel
  const suffix = currentChannel.slice(baseChannel.length)
  // for GitHub should be pre-release way be used
  if (baseChannel === "alpha" || publishConfig.provider === "github" || !isGenerateUpdatesFilesForAllChannels(packager)) {
    return [currentChannel]
  }

  switch (baseChannel) {
    case "beta":
      return warnAboutSuffixedChannelExpansion(currentChannel, suffix, [currentChannel, `alpha${suffix}`])

    case "latest":
      return warnAboutSuffixedChannelExpansion(currentChannel, suffix, [currentChannel, `alpha${suffix}`, `beta${suffix}`])

    default:
      return [currentChannel]
  }
}

/** Emitted once per suffixed channel — computeChannelNames runs per artifact. */
const suffixedChannelWarnings = new Set<string>()

/**
 * v26 only expanded a channel to its lower channels when the name was exactly alpha/beta/latest, so a
 * suffixed channel (the per-arch `${channel}-${arch}` pattern) published a single file. v27 reads the
 * base channel off the front and reattaches the suffix, which means a `latest-x64` publish now
 * overwrites `beta-x64.yml` in the same bucket — changing what live beta-x64 users are offered.
 */
function warnAboutSuffixedChannelExpansion(currentChannel: string, suffix: string, channels: Array<string>): Array<string> {
  if (suffix.length === 0 || suffixedChannelWarnings.has(currentChannel)) {
    return channels
  }
  suffixedChannelWarnings.add(currentChannel)
  log.warn(
    { channel: currentChannel, writes: channels.map(it => `${it}.yml`).join(", "), solution: "set generateUpdatesFilesForAllChannels: false to keep publishing a single file per suffixed channel" },
    `the suffixed channel "${currentChannel}" now expands to its lower channels — electron-builder <= 26 wrote only one file for suffixed channels. ` +
      "A later publish on a higher channel will overwrite these in the same bucket, changing what existing pre-release users are offered. " +
      "See https://www.electron.build/docs/migration/v27-breaking-changes#suffixed-update-channels-now-expand-to-lower-channels"
  )
  return channels
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
  const sharedInfo = await createUpdateInfo(version, event, await getReleaseInfo(packager))
  const tasks: Array<UpdateInfoFileTask> = []
  const electronUpdaterCompatibility = packager.platformOptions.electronUpdaterCompatibility || packager.config.electronUpdaterCompatibility || ">=2.16"
  // electron-updater < 2.16.0 predates the files[] array and reads the top-level path/sha512 (and Windows sha2) fields instead
  // (do not pass includePrerelease — it would make the default ">=2.16" intersect "<2.16.0" at the 2.16.0-0 prerelease point)
  const needsLegacyPathSha512 = semver.intersects(electronUpdaterCompatibility, "<2.16.0")
  // electron-updater < 2.0.0 on macOS reads the legacy <channel>-mac.json instead of <channel>-mac.yml
  const needsLegacyMacJsonCompatibility = semver.intersects(electronUpdaterCompatibility, "<2.0.0")
  warnAboutLegacyUpdaterCompatibility(electronUpdaterCompatibility, needsLegacyPathSha512)
  for (const publishConfiguration of publishConfigs) {
    let dir = outDir
    if (publishConfigs.length > 1 && publishConfiguration !== publishConfigs[0]) {
      dir = path.join(outDir, publishConfiguration.provider)
    }

    let needsLegacyMacJson = needsLegacyMacJsonCompatibility

    let info = sharedInfo
    // noinspection JSDeprecatedSymbols
    if (needsLegacyPathSha512) {
      // legacy top-level path/sha512 (and Windows sha2) for electron-updater 1.x – 2.15.0; modern clients read files[]
      info = {
        ...info,
        path: info.files[0].url,
        sha512: info.files[0].sha512,
      }
      if (packager.platform === Platform.WINDOWS) {
        // noinspection JSDeprecatedSymbols
        ;(info as WindowsUpdateInfo).sha2 = await sha2.value
      }
    }

    if (event.safeArtifactName != null && publishConfiguration.provider === "github") {
      // copy the file entries (not just the array) — `info` is shared across publish configurations,
      // so mutating an entry here would leak the GitHub-safe artifact name into other providers' update info
      const newFiles = info.files.map(file => ({ ...file }))
      newFiles[0].url = event.safeArtifactName
      info = {
        ...info,
        files: newFiles,
        // legacy top-level path mirrors files[0].url; only emitted for pre-2.16 compatibility
        ...(needsLegacyPathSha512 ? { path: event.safeArtifactName } : {}),
      }
    }

    for (const channel of computeChannelNames(packager, publishConfiguration)) {
      if (isMac && needsLegacyMacJson && event.file.endsWith(".zip")) {
        // write only for first channel (generateUpdatesFilesForAllChannels is a new functionality, no need to generate old mac update info file)
        needsLegacyMacJson = false
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

async function createUpdateInfo(version: string, event: ArtifactCreated, releaseInfo: ReleaseInfo): Promise<UpdateInfo> {
  const customUpdateInfo = event.updateInfo
  const url = path.basename(event.file)
  const sha512 = (customUpdateInfo == null ? null : customUpdateInfo.sha512) || (await hashFile(event.file))
  const files = [{ url, sha512 }]
  const result: UpdateInfo = {
    // @ts-ignore
    version,
    // @ts-ignore
    files,
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

/** Emitted once per process — createUpdateInfoTasks runs per artifact. */
let legacyCompatibilityWarningEmitted = false

/**
 * The default `electronUpdaterCompatibility` moved to ">=2.16", which is what stops the deprecated
 * top-level path/sha512 descriptor from being written. A range pinned below that keeps emitting it —
 * along with the SHA-256 `sha2` checksum on Windows, which v28 will reject outright. Nothing said so.
 */
function warnAboutLegacyUpdaterCompatibility(electronUpdaterCompatibility: string, needsLegacyPathSha512: boolean): void {
  if (!needsLegacyPathSha512 || legacyCompatibilityWarningEmitted) {
    return
  }
  legacyCompatibilityWarningEmitted = true
  log.warn(
    { electronUpdaterCompatibility, solution: 'drop the pin (the default is ">=2.16") unless you still ship apps embedding electron-updater 1.x-2.15' },
    "electronUpdaterCompatibility includes electron-updater versions below 2.16.0, so the deprecated top-level path/sha512 descriptor is still written to latest*.yml " +
      "(and, on Windows, the legacy SHA-256 sha2 checksum). Metadata validated only by sha2 is deprecated and v28 will reject it. " +
      "Every electron-updater since 2.16.0 reads files[] and ignores these fields. " +
      "See https://www.electron.build/docs/migration/v27-breaking-changes#latestyml-drops-legacy-top-level-pathsha512"
  )
}
