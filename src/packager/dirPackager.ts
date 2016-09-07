import { Promise as BluebirdPromise } from "bluebird"
import { emptyDir } from "fs-extra-p"
import { warn } from "../util/log"
import { PlatformPackager } from "../platformPackager"

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download"))
const extract: any = BluebirdPromise.promisify(require("extract-zip"))

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

function createDownloadOpts(opts: any, platform: string, arch: string, electronVersion: string) {
  const downloadOpts = Object.assign({
    cache: opts.cache,
    strictSSL: opts["strict-ssl"]
  }, opts.download)

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

export async function pack(packager: PlatformPackager<any>, out: string, platform: string, arch: string, electronVersion: string, initializeApp: () => Promise<any>) {
  const zipPath = (await BluebirdPromise.all<any>([
    downloadElectron(createDownloadOpts(packager.devMetadata.build, platform, arch, electronVersion)),
    emptyDir(out)
  ]))[0]
  await extract(zipPath, {dir: out})

  if (platform === "darwin" || platform === "mas") {
    await(<any>require("./mac")).createApp(packager, out, initializeApp)
  }
  else {
    await initializeApp()
  }
}