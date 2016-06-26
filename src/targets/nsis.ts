import { WinPackager } from "../winPackager"
import { Arch, NsisOptions } from "../metadata"
import { exec, debug } from "../util/util"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { getBin } from "../util/binDownload"
import { v5 as uuid5 } from "uuid-1345"
import { Target } from "../platformPackager"
import { archiveApp } from "./archive"
import { subTask, task } from "../util/log"
import { unlink } from "fs-extra-p"
import sanitizeFileName = require("sanitize-filename")
import semver = require("semver")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

const NSIS_VERSION = "nsis-3.0.0-rc.1.3"
//noinspection SpellCheckingInspection
const NSIS_SHA2 = "77bca57e784372dea1b69b0571d89d5a1c879c51d80d7c503f283a2e7de5f072"

//noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

const nsisPathPromise = getBin("nsis", NSIS_VERSION, `https://dl.bintray.com/electron-userland/bin/${NSIS_VERSION}.7z`, NSIS_SHA2)

export default class NsisTarget extends Target {
  private readonly options: NsisOptions

  private archs: Map<Arch, Promise<string>> = new Map()

  constructor(private packager: WinPackager, private outDir: string) {
    super("nsis")

    this.options = packager.info.devMetadata.build.nsis || Object.create(null)
  }

  async build(arch: Arch, appOutDir: string) {
    const packager = this.packager
    const archSuffix = arch == Arch.x64 ? "x64": "ia32"
    const archiveFile = path.join(this.outDir, `${packager.appInfo.name}-${packager.appInfo.version}-${archSuffix}.nsis.7z`)
    this.archs.set(arch, task(`Creating NSIS ${archSuffix} package`, archiveApp(packager.devMetadata.build.compression, "7z", archiveFile, appOutDir, true)))
  }

  finishBuild(): Promise<any> {
    return task("Building NSIS installer", this.buildInstaller()
      .then(() => BluebirdPromise.map(this.archs.values(), it => unlink(it))))
  }

  private async buildInstaller(): Promise<any> {
    const packager = this.packager

    const iconPath = await packager.getIconPath()
    const appInfo = packager.appInfo
    const version = appInfo.version
    const installerPath = path.join(this.outDir, `${appInfo.productName} Setup ${version}.exe`)

    const guid = this.options.guid || await BluebirdPromise.promisify(uuid5)({namespace: ELECTRON_BUILDER_NS_UUID, name: appInfo.id})
    const productName = appInfo.productName
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      PRODUCT_NAME: productName,
      INST_DIR_NAME: sanitizeFileName(productName),
      APP_DESCRIPTION: appInfo.description,
      VERSION: version,

      MUI_ICON: iconPath,
      MUI_UNICON: iconPath,

      COMPANY_NAME: appInfo.companyName,
    }

    for (let [arch, file] of this.archs) {
      defines[arch === Arch.x64 ? "APP_64" : "APP_32"] = await file
    }

    const oneClick = this.options.oneClick !== false

    const installerHeader = oneClick ? null : await this.getResource(this.options.installerHeader, "installerHeader.bmp")
    if (installerHeader != null) {
      defines.MUI_HEADERIMAGE = null
      defines.MUI_HEADERIMAGE_RIGHT = null
      defines.MUI_HEADERIMAGE_BITMAP = installerHeader
    }

    const headerIcon = oneClick ? await this.getResource(this.options.headerIcon, "headerIcon.ico") : null
    if (headerIcon != null) {
      defines.HEADER_ICO = headerIcon
    }

    if (this.options.perMachine === true) {
      defines.MULTIUSER_INSTALLMODE_DEFAULT_ALLUSERS = null
    }
    else {
      defines.MULTIUSER_INSTALLMODE_DEFAULT_CURRENTUSER = null
    }

    if (this.options.allowElevation !== false) {
      defines.MULTIUSER_INSTALLMODE_ALLOW_ELEVATION = null
    }

    // Error: invalid VIProductVersion format, should be X.X.X.X
    // so, we must strip beta
    const parsedVersion = new semver.SemVer(appInfo.version)
    const commands: any = {
      OutFile: `"${installerPath}"`,
      // LoadLanguageFile: '"${NSISDIR}/Contrib/Language files/English.nlf"',
      VIProductVersion: `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}.${appInfo.buildNumber || "0"}`,
      // VIFileVersion: packager.appInfo.buildVersion,
      VIAddVersionKey: [
        `ProductName "${appInfo.productName}"`,
        `CompanyName "${appInfo.versionString.CompanyName}"`,
        `LegalCopyright "${appInfo.versionString.LegalCopyright}"`,
        `FileDescription "${appInfo.description}"`,
        `FileVersion "${appInfo.buildVersion}"`,
      ],
    }

    if (packager.devMetadata.build.compression === "store") {
      commands.SetCompress = "off"
      defines.COMPRESS = "off"
    }
    else {
      commands.SetCompressor = "lzma"
      // default is 8: test app installer size 37.2 vs 36 if dict size 64
      commands.SetCompressorDictSize = "64"

      defines.COMPRESS = "auto"
    }

    if (oneClick) {
      defines.ONE_CLICK = null
    }

    debug(defines)
    debug(commands)

    if (this.packager.options.effectiveOptionComputed != null && this.packager.options.effectiveOptionComputed([defines, commands])) {
      return
    }

    await subTask(`Executing makensis`, NsisTarget.executeMakensis(defines, commands))
    await packager.sign(installerPath)

    this.packager.dispatchArtifactCreated(installerPath, `${appInfo.name}-Setup-${version}.exe`)
  }

  protected async getResource(custom: string | n, name: string): Promise<string | null> {
    let result = custom
    if (result === undefined) {
      const resourceList = await this.packager.resourceList
      if (resourceList.includes(name)) {
        return path.join(this.packager.buildResourcesDir, name)
      }
    }
    else {
      return path.resolve(this.packager.projectDir, result)
    }

    return null
  }

  private static async executeMakensis(defines: any, commands: any) {
    const args: Array<string> = []
    for (let name of Object.keys(defines)) {
      const value = defines[name]
      if (value == null) {
        args.push(`-D${name}`)
      }
      else {
        args.push(`-D${name}=${value}`)
      }
    }

    for (let name of Object.keys(commands)) {
      const value = commands[name]
      if (Array.isArray(value)) {
        for (let c of value) {
          args.push(`-X${name} ${c}`)
        }
      }
      else {
        args.push(`-X${name} ${value}`)
      }
    }

    args.push(path.join(__dirname, "..", "..", "templates", "nsis", "installer.nsi"))

    const binDir = process.platform === "darwin" ? "mac" : (process.platform === "win32" ? "Bin" : "linux")
    const nsisPath = await nsisPathPromise
    // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as MacOS/Windows version, so, we explicitly set NSISDIR

    await exec(path.join(nsisPath, binDir, process.platform === "win32" ? "makensis.exe" : "makensis"), args, {
      env: Object.assign({}, process.env, {NSISDIR: nsisPath})
    })
  }
}