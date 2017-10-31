import { hashFile, Arch } from "builder-util"
import { GenericServerOptions, PublishConfiguration, UpdateInfo, GithubOptions, WindowsUpdateInfo } from "builder-util-runtime"
import { outputFile, outputJson, readFile } from "fs-extra-p"
import { safeDump } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { ReleaseInfo } from "../configuration"
import { Platform } from "../core"
import { ArtifactCreated } from "../packagerApi"
import { PlatformPackager } from "../platformPackager"
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
  const archSuffix = (arch != null && arch !== Arch.x64 && packager.platform === Platform.LINUX) ? `-${Arch[arch]}` : ""
  return `${channel}${osSuffix}${archSuffix}.yml`
}

/** @internal */
export async function writeUpdateInfo(event: ArtifactCreated, _publishConfigs: Array<PublishConfiguration>): Promise<Array<ArtifactCreated>> {
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
  const events: Array<ArtifactCreated> = []
  for (let publishConfig of publishConfigs) {
    if (publishConfig.provider === "github" && "releaseType" in publishConfig) {
      publishConfig = {...publishConfig}
      delete (publishConfig as GithubOptions).releaseType
    }

    let dir = outDir
    if (publishConfigs.length > 1 && publishConfig !== publishConfigs[0]) {
      dir = path.join(outDir, publishConfig.provider)
    }

    // spaces is a new publish provider, no need to keep backward compatibility
    let isElectronUpdater1xCompatibility = publishConfig.provider !== "spaces"

    let info = sharedInfo
    // noinspection JSDeprecatedSymbols
    if (isElectronUpdater1xCompatibility && packager.platform === Platform.WINDOWS) {
      info = {
        ...info,
      };
      (info as WindowsUpdateInfo).sha2 = await sha2.value
    }

    if (event.safeArtifactName != null && publishConfig.provider === "github") {
      info = {
        ...info,
        url: event.safeArtifactName,
        path: event.safeArtifactName,
      }
    }

    for (const channel of computeChannelNames(packager, publishConfig)) {
      if (isMac && isElectronUpdater1xCompatibility) {
        // write only for first channel (generateUpdatesFilesForAllChannels is a new functionality, no need to generate old mac update info file)
        isElectronUpdater1xCompatibility = false
        await writeOldMacInfo(publishConfig, outDir, dir, channel, createdFiles, version, packager)
      }

      const updateInfoFile = path.join(dir, (publishConfig.provider === "bintray" ? `${version}_` : "") + getUpdateInfoFileName(channel, packager, event.arch))
      if (createdFiles.has(updateInfoFile)) {
        continue
      }

      createdFiles.add(updateInfoFile)

      const fileContent = Buffer.from(safeDump(info))
      await outputFile(updateInfoFile, fileContent)

      // artifact should be uploaded only to designated publish provider
      events.push({
        file: updateInfoFile,
        fileContent,
        arch: null,
        packager,
        target: null,
        publishConfig,
      })
    }
  }
  return events
}

async function createUpdateInfo(version: string, event: ArtifactCreated, releaseInfo: ReleaseInfo) {
  const customUpdateInfo = event.updateInfo
  const url = path.basename(event.file!)
  return {
    version,
    releaseDate: new Date().toISOString(),
    path: url,
    url,
    ...customUpdateInfo,
    sha512: (customUpdateInfo == null ? null : customUpdateInfo.sha512) || await hashFile(event.file!),
    ...releaseInfo as UpdateInfo,
  }
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
