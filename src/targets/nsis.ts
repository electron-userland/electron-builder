import { WinPackager } from "../winPackager"
import { Arch, NsisOptions } from "../metadata"
import { exec, log, debug } from "../util"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { getBin } from "../fpmDownload"
import { v5 as uuid5 } from "uuid-1345"
import { smarten, getArchSuffix } from "../platformPackager"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../awaiter")

const NSIS_VERSION = "3.0rc1"
const NSIS_SHA2 = "d9f8ad16d516f907db59814da4bc5da53619365ed8de42e21db69d3cd2afd8ec"

//noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

export default class NsisTarget {
  private readonly nsisPath: Promise<string>

  private readonly nsisOptions: NsisOptions

  constructor(private packager: WinPackager, private outDir: string, private appOutDir: string) {
    if (process.env.USE_SYSTEM_MAKENSIS) {
      this.nsisPath = BluebirdPromise.resolve("makensis")
    }
    else {
      this.nsisPath = getBin("nsis", `nsis-${NSIS_VERSION}`, `https://dl.bintray.com/electron-userland/bin/nsis-${NSIS_VERSION}.7z`, NSIS_SHA2)
    }

    this.nsisOptions = packager.info.devMetadata.build.nsis || Object.create(null)
  }

  async build(arch: Arch) {
    const packager = this.packager

    const iconPath = await packager.iconPath

    const guid = this.nsisOptions.guid || await BluebirdPromise.promisify(uuid5)({namespace: ELECTRON_BUILDER_NS_UUID, name: packager.info.appId})
    const version = this.packager.metadata.version
    const productName = packager.appName
    const defines: any = {
      PRODUCT_NAME: productName,
      APP_ID: packager.info.appId,
      APP_DESCRIPTION: smarten(packager.metadata.description),
      APP_BUILD_DIR: this.appOutDir,
      VERSION: version,

      MUI_ICON: iconPath,
      MUI_UNICON: iconPath,

      COMPANY_NAME: packager.metadata.author.name,
      APP_EXECUTABLE_FILENAME: `${packager.appName}.exe`,
      UNINSTALL_FILENAME: `Uninstall ${productName}.exe`,
      MULTIUSER_INSTALLMODE_INSTDIR: guid,
      MULTIUSER_INSTALLMODE_INSTALL_REGISTRY_KEY: guid,
      MULTIUSER_INSTALLMODE_UNINSTALL_REGISTRY_KEY: guid,
      MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME: "UninstallString",
      MULTIUSER_INSTALLMODE_INSTDIR_REGISTRY_VALUENAME: "InstallLocation",
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

    const archSuffix = getArchSuffix(arch)
    const installerPath = path.join(this.outDir, `${this.packager.appName} Setup ${version}${archSuffix}.exe`)
    const commands: any = {
      FileBufSize: "64",
      Name: `"${productName}"`,
      OutFile: `"${installerPath}"`,
      Unicode: "true",
    }

    if (packager.devMetadata.build.compression !== "store") {
      commands.SetCompressor = "/SOLID lzma"
      // default is 8: test app installer size 37.2 vs 36 if dict size 64
      commands.SetCompressorDictSize = "64"
    }
    else {
      commands.SetCompress = "off"
    }

    const oneClick = this.nsisOptions.oneClick !== false
    log(`Building ${oneClick ? "one-click " : ""}NSIS installer using nsis ${NSIS_VERSION}`)
    if (oneClick) {
      defines.ONE_CLICK = null
      commands.AutoCloseWindow = "true"
    }

    debug(defines)
    debug(commands)

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
      args.push(`-X${name} ${commands[name]}`)
    }

    args.push(path.join(__dirname, "..", "..", "templates", "nsis", "installer.nsi"))

    const binDir = process.platform === "darwin" ? "osx" : (process.platform === "win32" ? "Bin" : "linux")
    const nsisPath = await this.nsisPath
    // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as OS X/Windows version, so, we explicitly set NSISDIR
    await exec(path.join(nsisPath, binDir, process.platform === "win32" ? "makensis.exe" : "makensis"), args, {
      env: Object.assign({}, process.env, {NSISDIR: nsisPath})
    })

    await packager.sign(installerPath)

    this.packager.dispatchArtifactCreated(installerPath, `${this.packager.metadata.name}-Setup-${version}${archSuffix}.exe`)
  }
}