import BluebirdPromise from "bluebird-lst-c"
import { emptyDir, chmod } from "fs-extra-p"
import { warn } from "../util/log"
import { PlatformPackager } from "../platformPackager"
import { debug7zArgs, spawn } from "../util/util"
import { path7za } from "7zip-bin"
import * as path from "path"
import { copyDir } from "../util/fs"

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download-tf"))

function createDownloadOpts(opts: any, platform: string, arch: string, electronVersion: string) {
  if (opts.download != null) {
    warn(`"build.download is deprecated — please use build.electronDownload instead`)
  }

  const downloadOpts = Object.assign({
    cache: opts.cache,
    strictSSL: opts["strict-ssl"]
  }, opts.electronDownload || opts.download)

  subOptionWarning(downloadOpts, "download", "platform", platform)
  subOptionWarning(downloadOpts, "download", "arch", arch)
  subOptionWarning(downloadOpts, "download", "version", electronVersion)
  return downloadOpts
}

function subOptionWarning (properties: any, optionName: any, parameter: any, value: any) {
  if (properties.hasOwnProperty(parameter)) {
    warn(`${optionName}.${parameter} will be inferred from the main options`)
  }
  properties[parameter] = value
}

export async function unpackElectron(packager: PlatformPackager<any>, out: string, platform: string, arch: string, electronVersion: string) {
  const electronDist = packager.config.electronDist
  if (electronDist == null) {
    const zipPath = (await BluebirdPromise.all<any>([
      downloadElectron(createDownloadOpts(packager.config, platform, arch, electronVersion)),
      emptyDir(out)
    ]))[0]

    await spawn(path7za, debug7zArgs("x").concat(zipPath, `-o${out}`))
  }
  else {
    await emptyDir(out)
    await copyDir(path.resolve(packager.info.projectDir, electronDist, "Electron.app"), path.join(out, "Electron.app"))
  }

  if (platform === "linux") {
    // https://github.com/electron-userland/electron-builder/issues/786
    // fix dir permissions — opposite to extract-zip, 7za creates dir with no-access for other users, but dir must be readable for non-root users
    await BluebirdPromise.all([
      chmod(path.join(out, "locales"), "0755"),
      chmod(path.join(out, "resources"), "0755")
    ])
  }
}