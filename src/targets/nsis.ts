import { WinPackager } from "../winPackager"
import { Arch, NsisOptions } from "../metadata"
import { debug, doSpawn, handleProcess, use } from "../util/util"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { getBin } from "../util/binDownload"
import { v5 as uuid5 } from "uuid-1345"
import { Target } from "../platformPackager"
import { archiveApp } from "./archive"
import { subTask, task } from "../util/log"
import { unlink, readFile } from "fs-extra-p"
import semver = require("semver")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

const NSIS_VERSION = "nsis-3.0.0"
//noinspection SpellCheckingInspection
const NSIS_SHA2 = "7741089f3ca13de879f87836156ef785eab49844cacbeeabaeaefd1ade325ee7"

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
    const archSuffix = Arch[arch]
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
    const installerPath = path.join(this.outDir, `${appInfo.productFilename} Setup ${version}.exe`)

    const guid = this.options.guid || await BluebirdPromise.promisify(uuid5)({namespace: ELECTRON_BUILDER_NS_UUID, name: appInfo.id})
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      PRODUCT_NAME: appInfo.productName,
      PRODUCT_FILENAME: appInfo.productFilename,
      APP_DESCRIPTION: appInfo.description,
      VERSION: version,

      MUI_ICON: iconPath,
      MUI_UNICON: iconPath,

      COMPANY_NAME: appInfo.companyName,

      PROJECT_DIR: this.packager.projectDir,
      BUILD_RESOURCES_DIR: this.packager.buildResourcesDir,
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

    const installerHeaderIcon = oneClick ? await this.getResource(this.options.installerHeaderIcon, "installerHeaderIcon.ico") : null
    if (installerHeaderIcon != null) {
      defines.HEADER_ICO = installerHeaderIcon
    }

    if (this.options.perMachine === true) {
      defines.INSTALL_MODE_PER_ALL_USERS = null
    }

    if (!oneClick || this.options.perMachine === true) {
      defines.INSTALL_MODE_PER_ALL_USERS_REQUIRED = null
    }

    if (oneClick) {
      if (this.options.runAfterFinish !== false) {
        defines.RUN_AFTER_FINISH = null
      }
    }
    else if (this.options.allowElevation !== false) {
      defines.MULTIUSER_INSTALLMODE_ALLOW_ELEVATION = null
    }

    // Error: invalid VIProductVersion format, should be X.X.X.X
    // so, we must strip beta
    const parsedVersion = new semver.SemVer(appInfo.version)
    const versionKey = [
      `ProductName "${appInfo.productName}"`,
      `ProductVersion "${appInfo.version}"`,
      `CompanyName "${appInfo.companyName}"`,
      `LegalCopyright "${appInfo.copyright}"`,
      `FileDescription "${appInfo.description}"`,
      `FileVersion "${appInfo.buildVersion}"`,
    ]
    use(this.packager.platformSpecificBuildOptions.legalTrademarks, it => versionKey.push(`LegalTrademarks "${it}"`))

    const commands: any = {
      OutFile: `"${installerPath}"`,
      // LoadLanguageFile: '"${NSISDIR}/Contrib/Language files/English.nlf"',
      VIProductVersion: `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}.${appInfo.buildNumber || "0"}`,
      // VIFileVersion: packager.appInfo.buildVersion,
      VIAddVersionKey: versionKey,
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

    await subTask(`Executing makensis`, this.executeMakensis(defines, commands))
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

  private async executeMakensis(defines: any, commands: any) {
    const args: Array<string> = ["-WX"]
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

    const nsisTemplatesDir = path.join(__dirname, "..", "..", "templates", "nsis")
    args.push("-")

    const binDir = process.platform === "darwin" ? "mac" : (process.platform === "win32" ? "Bin" : "linux")
    const nsisPath = await nsisPathPromise

    const packager = this.packager
    const fileAssociations = asArray(packager.devMetadata.build.fileAssociations).concat(asArray(packager.platformSpecificBuildOptions.fileAssociations))
    let registerFileAssociationsScript = ""
    let unregisterFileAssociationsScript = ""
    let script = await readFile((await this.getResource(this.options.script, "installer.nsi")) || path.join(nsisTemplatesDir, "installer.nsi"), "utf8")

    const customInclude = await this.getResource(this.options.include, "installer.nsh")
    if (customInclude != null) {
      script = `!include "${customInclude}"\n!addincludedir "${this.packager.buildResourcesDir}"\n${script}`
    }

    if (fileAssociations.length !== 0) {
      script = "!include FileAssociation.nsh\n" + script
      for (let item of fileAssociations) {
        registerFileAssociationsScript += '${RegisterExtension} "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" ' + `"${normalizeExt(item.ext)}" "${item.name}"\n`
      }

      for (let item of fileAssociations) {
        unregisterFileAssociationsScript += "${UnRegisterExtension} " + `"${normalizeExt(item.ext)}" "${item.name}"\n`
      }
    }

    script = script.replace("!insertmacro registerFileAssociations", registerFileAssociationsScript)
    script = script.replace("!insertmacro unregisterFileAssociations", unregisterFileAssociationsScript)

    if (debug.enabled) {
      process.stdout.write("\n\nNSIS script:\n\n" + script + "\n\n---\nEnd of NSIS script.\n\n")
    }

    await new BluebirdPromise<any>((resolve, reject) => {
      const command = path.join(nsisPath, binDir, process.platform === "win32" ? "makensis.exe" : "makensis")
      const childProcess = doSpawn(command, args, {
        // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as MacOS/Windows version, so, we explicitly set NSISDIR
        env: Object.assign({}, process.env, {NSISDIR: nsisPath}),
        cwd: nsisTemplatesDir,
      })
      handleProcess("close", childProcess, command, resolve, reject)

      childProcess.stdin.end(script)
    })
  }
}

// nsis — add leading dot, mac — remove leading dot
function normalizeExt(ext: string) {
  return ext.startsWith(".") ? ext : `.${ext}`
}

function asArray<T>(v: n | T | Array<T>): Array<T> {
  if (v == null) {
    return []
  }
  else if (Array.isArray(v)) {
    return v
  }
  else {
    return [v]
  }
}