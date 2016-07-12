import { Promise as BluebirdPromise } from "bluebird"
import { emptyDir } from "fs-extra-p"
import { warn } from "../util/log"
import { AppInfo } from "../appInfo"

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download"))
const extract: any = BluebirdPromise.promisify(require("extract-zip"))

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

export interface ElectronPackagerOptions {
  "extend-info"?: string
  "app-category-type"?: string
  appBundleId: string

  protocols?: any

  appInfo: AppInfo

  icon?: string;

  "app-bundle-id"?: string | null;

  "helper-bundle-id"?: string | null;

  ignore?: any

  initializeApp?: (opts: ElectronPackagerOptions, buildDir: string, appRelativePath: string) => Promise<any>
}

const supportedPlatforms: any = {
  // Maps to module ID for each platform (lazy-required if used)
  darwin: "./mac",
  linux: "./linux",
  mas: "./mac", // map to darwin
  win32: "./win32"
}

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

export async function pack(opts: ElectronPackagerOptions, out: string, platform: string, arch: string, electronVersion: string) {
  const zipPath = await downloadElectron(createDownloadOpts(opts, platform, arch, electronVersion))
  await emptyDir(out)
  await extract(zipPath, {dir: out})
  await require(supportedPlatforms[platform]).createApp(opts, out)
}