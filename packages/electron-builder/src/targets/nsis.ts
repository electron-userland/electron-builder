import { WinPackager } from "../winPackager"
import { exec, debug, doSpawn, handleProcess, use, asArray, isEmptyOrSpaces } from "electron-builder-util"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { getBinFromBintray } from "electron-builder-util/out/binDownload"
import { v5 as uuid5 } from "uuid-1345"
import { normalizeExt } from "../platformPackager"
import { archive } from "./archive"
import { subTask, log, warn } from "electron-builder-util/out/log"
import { unlink, readFile } from "fs-extra-p"
import { NsisOptions, NsisWebOptions } from "../options/winOptions"
import { Target, Arch, Platform } from "electron-builder-core"
import sanitizeFileName from "sanitize-filename"
import { copyFile } from "electron-builder-util/out/fs"
import { computeDownloadUrl, getPublishConfigs, getPublishConfigsForUpdateInfo } from "../publish/PublishManager"

const NSIS_VERSION = "3.0.1.6"
//noinspection SpellCheckingInspection
const NSIS_SHA2 = "4bd85f3a54311fd55814ec87fbcb0ab9c64b3dea4179c891e7748df8748f87c8"

//noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

const nsisPathPromise = getBinFromBintray("nsis", NSIS_VERSION, NSIS_SHA2)

const USE_NSIS_BUILT_IN_COMPRESSOR = false

export default class NsisTarget extends Target {
  private readonly options: NsisOptions

  private archs: Map<Arch, string> = new Map()

  private readonly nsisTemplatesDir = path.join(__dirname, "..", "..", "templates", "nsis")

  constructor(private packager: WinPackager, private outDir: string, targetName: string) {
    super(targetName)

    let options = this.packager.config.nsis || Object.create(null)
    if (targetName !== "nsis") {
      options = Object.assign(options, (<any>this.packager.config)[targetName])
    }
    this.options = options

    const deps = packager.info.metadata.dependencies
    if (deps != null && deps["electron-squirrel-startup"] != null) {
      warn('"electron-squirrel-startup" dependency is not required for NSIS')
    }
  }

  async build(appOutDir: string, arch: Arch) {
    this.archs.set(arch, appOutDir)
  }

  private async doBuild(appOutDir: string, arch: Arch) {
    log(`Packaging NSIS installer for arch ${Arch[arch]}`)

    await copyFile(path.join(await nsisPathPromise, "elevate.exe"), path.join(appOutDir, "resources", "elevate.exe"), null, false)

    const packager = this.packager
    const format = this.options.useZip ? "zip" : "7z"
    const archiveFile = path.join(this.outDir, `${packager.appInfo.name}-${packager.appInfo.version}-${Arch[arch]}.nsis.${format}`)
    return await archive(packager.config.compression, format, archiveFile, appOutDir, true)
  }

  async finishBuild(): Promise<any> {
    log("Building NSIS installer")
    const filesToDelete: Array<string> = []
    try {
      await this.buildInstaller(filesToDelete)
    }
    finally {
      if (filesToDelete.length > 0) {
        await BluebirdPromise.map(filesToDelete, it => unlink(it))
      }
    }
  }

  private async buildInstaller(filesToDelete: Array<string>): Promise<any> {
    const packager = this.packager
    const appInfo = packager.appInfo
    const version = appInfo.version
    const options = this.options
    const installerFilename = packager.expandArtifactNamePattern(options, "exe", null, "${productName} Setup ${version}.${ext}")
    const iconPath = await packager.getResource(options.installerIcon, "installerIcon.ico") || await packager.getIconPath()
    const oneClick = options.oneClick !== false

    const installerPath = path.join(this.outDir, installerFilename)
    const guid = options.guid || await BluebirdPromise.promisify(uuid5)({namespace: ELECTRON_BUILDER_NS_UUID, name: appInfo.id})
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      PRODUCT_NAME: appInfo.productName,
      PRODUCT_FILENAME: appInfo.productFilename,
      APP_FILENAME: (!oneClick || options.perMachine === true) && /^[-_+0-9a-zA-Z ]+$/.test(appInfo.productFilename) ? appInfo.productFilename : appInfo.name,
      APP_DESCRIPTION: appInfo.description,
      VERSION: version,

      COMPANY_NAME: appInfo.companyName,

      PROJECT_DIR: packager.projectDir,
      BUILD_RESOURCES_DIR: packager.buildResourcesDir,
    }

    if (iconPath != null) {
      defines.MUI_ICON = iconPath
      defines.MUI_UNICON = iconPath
    }

    if (this.archs.size === 1 && USE_NSIS_BUILT_IN_COMPRESSOR) {
      defines.APP_BUILD_DIR = this.archs.get(this.archs.keys().next().value)
    }
    else {
      await BluebirdPromise.map(this.archs.keys(), async arch => {
        const file = await this.doBuild(this.archs.get(arch)!, arch)
        defines[arch === Arch.x64 ? "APP_64" : "APP_32"] = file
        defines[(arch === Arch.x64 ? "APP_64" : "APP_32") + "_NAME"] = path.basename(file)

        if (this.isWebInstaller) {
          packager.dispatchArtifactCreated(file, this)
        }
        else {
          filesToDelete.push(file)
        }
      })
    }

    await this.configureDefines(oneClick, defines)

    if (this.isWebInstaller) {
      let appPackageUrl = (<NsisWebOptions>options).appPackageUrl
      if (appPackageUrl == null) {
        const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, this.options, false))
        if (publishConfigs == null || publishConfigs.length === 0) {
          throw new Error("Cannot compute app package download URL")
        }

        computeDownloadUrl(publishConfigs[0], null, packager.appInfo.version, {
          os: Platform.WINDOWS.buildConfigurationKey,
          arch: Arch[Arch.x64]
        })

        defines.APP_PACKAGE_URL_IS_INCOMLETE = null
      }

      defines.APP_PACKAGE_URL = appPackageUrl
    }

    const commands: any = {
      OutFile: `"${installerPath}"`,
      VIProductVersion: appInfo.versionInWeirdWindowsForm,
      VIAddVersionKey: this.computeVersionKey(),
      Unicode: true,
    }

    if (packager.config.compression === "store") {
      commands.SetCompress = "off"
    }
    else {
      commands.SetCompressor = "lzma"
      if (!this.isWebInstaller) {
        defines.COMPRESS = "auto"
      }
    }

    debug(defines)
    debug(commands)

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed([defines, commands])) {
      return
    }

    await subTask(`Executing makensis — installer`, this.executeMakensis(defines, commands, true, await this.computeScript(defines, commands, installerPath)))
    await packager.sign(installerPath)

    packager.dispatchArtifactCreated(installerPath, this, `${packager.appInfo.name}-Setup-${version}.exe`)
  }

  private get isWebInstaller(): boolean {
    return this.name === "nsis-web"
  }

  private async computeScript(defines: any, commands: any, installerPath: string) {
    const packager = this.packager
    const customScriptPath = await packager.getResource(this.options.script, "installer.nsi")
    const script = await readFile(customScriptPath || path.join(this.nsisTemplatesDir, "installer.nsi"), "utf8")

    if (customScriptPath != null) {
      log("Custom NSIS script is used - uninstaller is not signed by electron-builder")
      return script
    }

    const uninstallerPath = await
    packager.getTempFile("uninstaller.exe")
    const isWin = process.platform === "win32"
    defines.BUILD_UNINSTALLER = null
    defines.UNINSTALLER_OUT_FILE = isWin ? uninstallerPath : path.win32.join("Z:", uninstallerPath)
    await subTask(`Executing makensis — uninstaller`, this.executeMakensis(defines, commands, false, script))
    await exec(isWin ? installerPath : "wine", isWin ? [] : [installerPath])
    await packager.sign(uninstallerPath)

    delete defines.BUILD_UNINSTALLER
    // platform-specific path, not wine
    defines.UNINSTALLER_OUT_FILE = uninstallerPath
    return script
  }

  private computeVersionKey() {
    // Error: invalid VIProductVersion format, should be X.X.X.X
    // so, we must strip beta
    const localeId = this.options.language || "1033"
    const appInfo = this.packager.appInfo
    const versionKey = [
      `/LANG=${localeId} ProductName "${appInfo.productName}"`,
      `/LANG=${localeId} ProductVersion "${appInfo.version}"`,
      `/LANG=${localeId} CompanyName "${appInfo.companyName}"`,
      `/LANG=${localeId} LegalCopyright "${appInfo.copyright}"`,
      `/LANG=${localeId} FileDescription "${appInfo.description}"`,
      `/LANG=${localeId} FileVersion "${appInfo.buildVersion}"`,
    ]
    use(this.packager.platformSpecificBuildOptions.legalTrademarks, it => versionKey.push(`/LANG=${localeId} LegalTrademarks "${it}"`))
    return versionKey
  }

  private async configureDefines(oneClick: boolean, defines: any) {
    const packager = this.packager
    const options = this.options

    const installerHeader = oneClick ? null : await packager.getResource(options.installerHeader, "installerHeader.bmp")
    if (installerHeader != null) {
      defines.MUI_HEADERIMAGE = null
      defines.MUI_HEADERIMAGE_RIGHT = null
      defines.MUI_HEADERIMAGE_BITMAP = installerHeader
    }

    const installerHeaderIcon = oneClick ? await packager.getResource(options.installerHeaderIcon, "installerHeaderIcon.ico") : null
    if (installerHeaderIcon != null) {
      defines.HEADER_ICO = installerHeaderIcon
    }

    if (options.perMachine === true) {
      defines.INSTALL_MODE_PER_ALL_USERS = null
    }

    if (!oneClick || options.perMachine === true) {
      defines.INSTALL_MODE_PER_ALL_USERS_REQUIRED = null
    }

    if (oneClick) {
      if (options.runAfterFinish !== false) {
        defines.RUN_AFTER_FINISH = null
      }
    }
    else if (options.allowElevation !== false) {
      defines.MULTIUSER_INSTALLMODE_ALLOW_ELEVATION = null
    }

    if (options.allowToChangeInstallationDirectory) {
      if (oneClick) {
        throw new Error("allowToChangeInstallationDirectory makes sense only for boring installer (please set oneClick to false)")
      }
      defines.allowToChangeInstallationDirectory = null
    }

    if (!this.isWebInstaller && defines.APP_BUILD_DIR == null) {
      if (options.useZip) {
        defines.ZIP_COMPRESSION = null
      }

      defines.COMPRESSION_METHOD = options.useZip ? "zip" : "7z"
    }

    if (oneClick) {
      defines.ONE_CLICK = null
    }

    if (options.menuCategory != null) {
      const menu = sanitizeFileName(options.menuCategory === true ? packager.appInfo.companyName : <string>options.menuCategory)
      if (!isEmptyOrSpaces(menu)) {
        defines.MENU_FILENAME = menu
      }
    }

    use(await packager.getResource(options.license, "license.rtf", "license.txt"), it => defines.LICENSE_FILE = it)
  }

  private async executeMakensis(defines: any, commands: any, isInstaller: boolean, originalScript: string) {
    const args: Array<string> = (this.options.warningsAsErrors === false) ? [] : ["-WX"]
    for (const name of Object.keys(defines)) {
      const value = defines[name]
      if (value == null) {
        args.push(`-D${name}`)
      }
      else {
        args.push(`-D${name}=${value}`)
      }
    }

    for (const name of Object.keys(commands)) {
      const value = commands[name]
      if (Array.isArray(value)) {
        for (const c of value) {
          args.push(`-X${name} ${c}`)
        }
      }
      else {
        args.push(`-X${name} ${value}`)
      }
    }

    args.push("-")

    const binDir = process.platform === "darwin" ? "mac" : (process.platform === "win32" ? "Bin" : "linux")
    const nsisPath = await nsisPathPromise

    let script = originalScript
    const packager = this.packager
    const customInclude = await packager.getResource(this.options.include, "installer.nsh")
    if (customInclude != null) {
      script = `!include "${customInclude}"\n!addincludedir "${packager.buildResourcesDir}"\n${script}`
    }

    const fileAssociations = packager.fileAssociations
    if (fileAssociations.length !== 0) {
      if (this.options.perMachine !== true) {
        // https://github.com/electron-userland/electron-builder/issues/772
        throw new Error(`Please set perMachine to true — file associations works on Windows only if installed for all users`)
      }

      script = "!include FileAssociation.nsh\n" + script
      if (isInstaller) {
        let registerFileAssociationsScript = ""
        for (const item of fileAssociations) {
          const extensions = asArray(item.ext).map(normalizeExt)
          for (const ext of extensions) {
            const customIcon = await packager.getResource(item.icon, `${extensions[0]}.ico`)
            let installedIconPath = "$appExe,0"
            if (customIcon != null) {
              installedIconPath = `$INSTDIR\\resources\\${path.basename(customIcon)}`
              //noinspection SpellCheckingInspection
              registerFileAssociationsScript += `  File "/oname=${installedIconPath}" "${customIcon}"\n`
            }

            const icon = `"${installedIconPath}"`
            const commandText = `"Open with ${packager.appInfo.productName}"`
            const command = '"$appExe $\\"%1$\\""'
            registerFileAssociationsScript += `  !insertmacro APP_ASSOCIATE "${ext}" "${item.name || ext}" "${item.description || ""}" ${icon} ${commandText} ${command}\n`
          }
        }
        script = `!macro registerFileAssociations\n${registerFileAssociationsScript}!macroend\n${script}`
      }
      else {
        let unregisterFileAssociationsScript = ""
        for (const item of fileAssociations) {
          for (const ext of asArray(item.ext)) {
            unregisterFileAssociationsScript += `  !insertmacro APP_UNASSOCIATE "${normalizeExt(ext)}" "${item.name || ext}"\n`
          }
        }
        script = `!macro unregisterFileAssociations\n${unregisterFileAssociationsScript}!macroend\n${script}`
      }
    }

    if (debug.enabled) {
      process.stdout.write("\n\nNSIS script:\n\n" + script + "\n\n---\nEnd of NSIS script.\n\n")
    }

    await new BluebirdPromise<any>((resolve, reject) => {
      const command = path.join(nsisPath, binDir, process.platform === "win32" ? "makensis.exe" : "makensis")
      const childProcess = doSpawn(command, args, {
        // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as MacOS/Windows version, so, we explicitly set NSISDIR
        env: Object.assign({}, process.env, {NSISDIR: nsisPath}),
        cwd: this.nsisTemplatesDir,
      }, true)
      handleProcess("close", childProcess, command, resolve, reject)

      childProcess.stdin.end(script)
    })
  }
}