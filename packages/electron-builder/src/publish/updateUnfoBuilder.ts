import { hashFile } from "builder-util"
import { GenericServerOptions, PublishConfiguration, UpdateInfo, GithubOptions } from "builder-util-runtime"
import { outputFile, outputJson, readFile } from "fs-extra-p"
import { safeDump } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { ReleaseInfo } from "../configuration"
import { Platform } from "../core"
import { ArtifactCreated } from "../packagerApi"
import { PlatformPackager } from "../platformPackager"
import { computeDownloadUrl, getPublishConfigsForUpdateInfo } from "./PublishManager"

/** @internal */
export async function writeUpdateInfo(event: ArtifactCreated, _publishConfigs: Array<PublishConfiguration>) {
  const packager = event.packager
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, _publishConfigs, event.arch)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return
  }

  const target = event.target!
  const outDir = target.outDir
  const version = packager.appInfo.version
  const sha2 = new Lazy<string>(() => hashFile(event.file!, "sha256", "hex"))
  const isMac = packager.platform === Platform.MAC

  const releaseInfo: ReleaseInfo = {...packager.config.releaseInfo}
  if (releaseInfo.releaseNotes == null) {
    const releaseNotesFile = await packager.getResource(releaseInfo.releaseNotesFile, "release-notes.md")
    const releaseNotes = releaseNotesFile == null ? null : await readFile(releaseNotesFile, "utf-8")
    // to avoid undefined in the file, check for null
    if (releaseNotes != null) {
      releaseInfo.releaseNotes = releaseNotes
    }
  }
  delete releaseInfo.releaseNotesFile

  const createdFiles = new Set<string>()

  const sharedInfo = await createUpdateInfo(version, event, releaseInfo)
  for (let publishConfig of publishConfigs) {
    let info = sharedInfo
    if (publishConfig.provider === "bintray") {
      continue
    }

    if (publishConfig.provider === "github" && "releaseType" in publishConfig) {
      publishConfig = {...publishConfig}
      delete (publishConfig as GithubOptions).releaseType
    }

    const channel = (publishConfig as GenericServerOptions).channel || "latest"

    let dir = outDir
    if (publishConfigs.length > 1 && publishConfig !== publishConfigs[0]) {
      dir = path.join(outDir, publishConfig.provider)
    }

    // spaces is a new publish provider, no need to keep backward compatibility
    const isElectronUpdater1xCompatibility = publishConfig.provider !== "spaces"

    if (isMac && isElectronUpdater1xCompatibility) {
      await writeOldMacInfo(publishConfig, outDir, dir, channel, createdFiles, version, packager)
    }

    const updateInfoFile = path.join(dir, `${channel}${isMac ? "-mac" : ""}.yml`)
    if (createdFiles.has(updateInfoFile)) {
      continue
    }

    createdFiles.add(updateInfoFile)

    // noinspection JSDeprecatedSymbols
    if (isElectronUpdater1xCompatibility && packager.platform === Platform.WINDOWS && info.sha2 == null) {
      // backward compatibility
      (info as any).sha2 = await sha2.value
    }

    if (event.safeArtifactName != null && publishConfig.provider === "github") {
      info = {
        ...info,
        githubArtifactName: event.safeArtifactName,
      }
    }
    await outputFile(updateInfoFile, safeDump(info))

    // artifact should be uploaded only to designated publish provider
    packager.info.dispatchArtifactCreated({
      file: updateInfoFile,
      arch: null,
      packager,
      target: null,
      publishConfig,
    })
  }
}

async function createUpdateInfo(version: string, event: ArtifactCreated, releaseInfo: ReleaseInfo) {
  const info: UpdateInfo = {
    version,
    releaseDate: new Date().toISOString(),
    path: path.basename(event.file!),
    sha512: await hashFile(event.file!),
    ...releaseInfo as UpdateInfo,
  }

  const packageFiles = event.packageFiles
  if (packageFiles != null) {
    const keys = Object.keys(packageFiles)
    if (keys.length > 0) {
      info.packages = {}
      for (const arch of keys) {
        const packageFileInfo = packageFiles[arch]
        info.packages[arch] = {
          ...packageFileInfo,
          file: path.basename(packageFileInfo.file)
        }
      }
    }
  }
  return info
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
