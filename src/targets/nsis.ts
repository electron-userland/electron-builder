import { WinPackager } from "../winPackager"
import { Arch, NsisOptions } from "../metadata"
import { exec, debug } from "../util"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { getBin } from "../util/binDownload"
import { v5 as uuid5 } from "uuid-1345"
import { getArchSuffix } from "../platformPackager"
import { archiveApp } from "./archive"
import { subTask } from "../log"
import sanitizeFileName = require("sanitize-filename")
import semver = require("semver")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../awaiter")

const NSIS_VERSION = "nsis-3.0.0-rc.1.2"
const NSIS_SHA2 = "d96f714ba552a5ebccf2593ed3fee1b072b67e7bfd1b90d66a5eb0cd3ca41d16"

//noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

const nsisPathPromise = getBin("nsis", NSIS_VERSION, `https://dl.bintray.com/electron-userland/bin/${NSIS_VERSION}.7z`, NSIS_SHA2)

export default class NsisTarget {
  private readonly nsisOptions: NsisOptions

  constructor(private packager: WinPackager, private outDir: string, private appOutDir: string) {
    this.nsisOptions = packager.info.devMetadata.build.nsis || Object.create(null)
  }

  async build(arch: Arch) {
    const packager = this.packager

    const iconPath = await packager.iconPath
    const appInfo = packager.appInfo
    const version = appInfo.version
    const archSuffix = getArchSuffix(arch)
    const installerPath = path.join(this.outDir, `${appInfo.productName} Setup ${version}${archSuffix}.exe`)
    // const archiveFile = path.join(this.outDir, `.${packager.metadata.name}-${packager.metadata.version}${archSuffix}.7z`)
    const archiveFile = path.join(this.outDir, `app.7z`)

    const guid = this.nsisOptions.guid || await BluebirdPromise.promisify(uuid5)({namespace: ELECTRON_BUILDER_NS_UUID, name: appInfo.id})
    const productName = appInfo.productName
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      PRODUCT_NAME: productName,
      INST_DIR_NAME: sanitizeFileName(productName),
      APP_DESCRIPTION: appInfo.description,
      APP_ARCHIVE: archiveFile,
      VERSION: version,

      MUI_ICON: iconPath,
      MUI_UNICON: iconPath,

      COMPANY_NAME: appInfo.companyName,
    }

    if (this.nsisOptions.perMachine === true) {
      defines.MULTIUSER_INSTALLMODE_DEFAULT_ALLUSERS = null
    }
    else {
      defines.MULTIUSER_INSTALLMODE_DEFAULT_CURRENTUSER = null
    }

    if (this.nsisOptions.allowElevation !== false) {
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

    await subTask("Packing app into 7z archive", archiveApp(packager.devMetadata.build.compression, "7z", archiveFile, this.appOutDir, true))

    const oneClick = this.nsisOptions.oneClick !== false
    if (oneClick) {
      defines.ONE_CLICK = null
    }

    debug(defines)
    debug(commands)

    await subTask(`Executing makensis`, NsisTarget.executeMakensis(defines, commands))
    await packager.sign(installerPath)

    this.packager.dispatchArtifactCreated(installerPath, `${appInfo.name}-Setup-${version}${archSuffix}.exe`)
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
    // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as OS X/Windows version, so, we explicitly set NSISDIR

    await exec(path.join(nsisPath, binDir, process.platform === "win32" ? "makensis.exe" : "makensis"), args, {
      env: Object.assign({}, process.env, {NSISDIR: nsisPath})
    })
  }
}