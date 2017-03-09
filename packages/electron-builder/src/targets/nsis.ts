import BluebirdPromise from "bluebird-lst"
import { Arch, Target } from "electron-builder-core"
import { asArray, debug, doSpawn, exec, getPlatformIconFileName, handleProcess, isEmptyOrSpaces, use } from "electron-builder-util"
import { getBinFromBintray } from "electron-builder-util/out/binDownload"
import { copyFile } from "electron-builder-util/out/fs"
import { log, subTask, warn } from "electron-builder-util/out/log"
import { readFile, unlink } from "fs-extra-p"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { v5 as uuid5 } from "uuid-1345"
import { NsisOptions } from "../options/winOptions"
import { normalizeExt } from "../platformPackager"
import { getSignVendorPath } from "../windowsCodeSign"
import { WinPackager } from "../winPackager"
import { archive } from "./archive"

const ELECTRON_BUILDER_NS_UUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

const nsisPathPromise = getBinFromBintray("nsis", "3.0.1.10", "302a8adebf0b553f74cddd494154a586719ff9d4767e94d8a76547a9bb06200c")
const nsisResourcePathPromise = getBinFromBintray("nsis-resources", "3.0.0", "cde0e77b249e29d74250bf006aa355d3e02b32226e1c6431fb48facae41d8a7e")

const USE_NSIS_BUILT_IN_COMPRESSOR = false

export default class NsisTarget extends Target {
  protected readonly options: NsisOptions

  private archs: Map<Arch, string> = new Map()

  private readonly nsisTemplatesDir = path.join(__dirname, "..", "..", "templates", "nsis")

  constructor(protected readonly packager: WinPackager, readonly outDir: string, targetName: string) {
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

  private async buildAppPackage(appOutDir: string, arch: Arch) {
    await BluebirdPromise.all([
      copyFile(path.join(await nsisPathPromise, "elevate.exe"), path.join(appOutDir, "resources", "elevate.exe"), null, false),
      copyFile(path.join(await getSignVendorPath(), "windows-10", Arch[arch], "signtool.exe"), path.join(appOutDir, "resources", "signtool.exe"), null, false),
    ])

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

  protected get installerFilenamePattern(): string {
    return "${productName} " + (this.isPortable ? "" : "Setup ") + "${version}.${ext}"
  }

  private get isPortable() {
    return this.name === "portable"
  }

  private async buildInstaller(filesToDelete: Array<string>): Promise<any> {
    const isPortable = this.isPortable

    const packager = this.packager
    const appInfo = packager.appInfo
    const version = appInfo.version
    const options = this.options
    const installerFilename = packager.expandArtifactNamePattern(options, "exe", null, this.installerFilenamePattern)
    const iconPath = (isPortable ? null : await packager.getResource(options.installerIcon, "installerIcon.ico")) || await packager.getIconPath()
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

    // electron uses product file name as app data, define it as well to remove on uninstall
    if (defines.APP_FILENAME != appInfo.productFilename) {
      defines.APP_PRODUCT_FILENAME = appInfo.productFilename
    }

    const commands: any = {
      OutFile: `"${installerPath}"`,
      VIProductVersion: appInfo.versionInWeirdWindowsForm,
      VIAddVersionKey: this.computeVersionKey(),
      Unicode: this.isUnicodeEnabled,
    }

    if (iconPath != null) {
      if (isPortable) {
        commands.Icon = iconPath
      }
      else {
        defines.MUI_ICON = iconPath
        defines.MUI_UNICON = iconPath
      }
    }

    if (this.archs.size === 1 && USE_NSIS_BUILT_IN_COMPRESSOR) {
      defines.APP_BUILD_DIR = this.archs.get(this.archs.keys().next().value)
    }
    else {
      await BluebirdPromise.map(this.archs.keys(), async arch => {
        const file = await subTask(`Packaging NSIS installer for arch ${Arch[arch]}`, this.buildAppPackage(this.archs.get(arch)!, arch))
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

    this.configureDefinesForAllTypeOfInstaller(defines)
    if (!isPortable) {
      await this.configureDefines(oneClick, defines)
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

    const script = isPortable ? await readFile(path.join(this.nsisTemplatesDir, "portable.nsi"), "utf8") : await this.computeScriptAndSignUninstaller(defines, commands, installerPath)
    await this.executeMakensis(defines, commands, await this.computeFinalScript(script, true))
    await packager.sign(installerPath)

    packager.dispatchArtifactCreated(installerPath, this, this.generateGitHubInstallerName())
  }

  protected generateGitHubInstallerName() {
    return `${this.packager.appInfo.name}-${this.isPortable ? "" : "Setup-"}${this.packager.appInfo.version}.exe`
  }

  private get isUnicodeEnabled() {
    return this.options.unicode == null ? true : this.options.unicode
  }

  protected get isWebInstaller(): boolean {
    return false
  }

  private async computeScriptAndSignUninstaller(defines: any, commands: any, installerPath: string) {
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
    await this.executeMakensis(defines, commands, await this.computeFinalScript(script, false))
    await exec(isWin ? installerPath : "wine", isWin ? [] : [installerPath])
    await packager.sign(uninstallerPath, "  Signing NSIS uninstaller")

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

  protected async configureDefines(oneClick: boolean, defines: any) {
    const packager = this.packager
    const options = this.options

    if (oneClick) {
      defines.ONE_CLICK = null

      if (options.runAfterFinish !== false) {
        defines.RUN_AFTER_FINISH = null
      }

      const installerHeaderIcon = await packager.getResource(options.installerHeaderIcon, "installerHeaderIcon.ico")
      if (installerHeaderIcon != null) {
        defines.HEADER_ICO = installerHeaderIcon
      }
    }
    else {
      const installerHeader = await
      packager.getResource(options.installerHeader, "installerHeader.bmp")
      if (installerHeader != null) {
        defines.MUI_HEADERIMAGE = null
        defines.MUI_HEADERIMAGE_RIGHT = null
        defines.MUI_HEADERIMAGE_BITMAP = installerHeader
      }

      const bitmap = (await packager.getResource(options.installerSidebar, "installerSidebar.bmp")) || "${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp"
      defines.MUI_WELCOMEFINISHPAGE_BITMAP = bitmap
      defines.MUI_UNWELCOMEFINISHPAGE_BITMAP = (await packager.getResource(options.uninstallerSidebar, "uninstallerSidebar.bmp")) || bitmap

      if (options.allowElevation !== false) {
        defines.MULTIUSER_INSTALLMODE_ALLOW_ELEVATION = null
      }
    }

    if (options.perMachine === true) {
      defines.INSTALL_MODE_PER_ALL_USERS = null
    }

    if (!oneClick || options.perMachine === true) {
      defines.INSTALL_MODE_PER_ALL_USERS_REQUIRED = null
    }

    if (options.allowToChangeInstallationDirectory) {
      if (oneClick) {
        throw new Error("allowToChangeInstallationDirectory makes sense only for boring installer (please set oneClick to false)")
      }
      defines.allowToChangeInstallationDirectory = null
    }

    if (options.menuCategory != null) {
      const menu = sanitizeFileName(options.menuCategory === true ? packager.appInfo.companyName : <string>options.menuCategory)
      if (!isEmptyOrSpaces(menu)) {
        defines.MENU_FILENAME = menu
      }
    }

    use(await packager.getResource(options.license, "license.rtf", "license.txt"), it => defines.LICENSE_FILE = it)

    if (options.multiLanguageInstaller == null ? this.isUnicodeEnabled : options.multiLanguageInstaller) {
      defines.MULTI_LANGUAGE_INSTALLER = null
    }

    if (options.deleteAppDataOnUninstall) {
      defines.DELETE_APP_DATA_ON_UNINSTALL = null
    }
  }

  private configureDefinesForAllTypeOfInstaller(defines: any) {
    const options = this.options

    if (!this.isWebInstaller && defines.APP_BUILD_DIR == null) {
      if (options.useZip) {
        defines.ZIP_COMPRESSION = null
      }

      defines.COMPRESSION_METHOD = options.useZip ? "zip" : "7z"
    }
  }

  private async executeMakensis(defines: any, commands: any, script: string) {
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

    if (debug.enabled) {
      process.stdout.write("\n\nNSIS script:\n\n" + script + "\n\n---\nEnd of NSIS script.\n\n")
    }

    const nsisPath = await nsisPathPromise
    await new BluebirdPromise<any>((resolve, reject) => {
      const command = path.join(nsisPath, process.platform === "darwin" ? "mac" : (process.platform === "win32" ? "Bin" : "linux"), process.platform === "win32" ? "makensis.exe" : "makensis")
      const childProcess = doSpawn(command, args, {
        // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as MacOS/Windows version, so, we explicitly set NSISDIR
        env: Object.assign({}, process.env, {NSISDIR: nsisPath}),
        cwd: this.nsisTemplatesDir,
      }, true)
      handleProcess("close", childProcess, command, resolve, reject)

      childProcess.stdin.end(script)
    })
  }

  private async computeFinalScript(originalScript: string, isInstaller: boolean) {
    const packager = this.packager
    let scriptHeader = `!addincludedir "${path.win32.join(__dirname, "..", "..", "templates", "nsis", "include")}"\n`
    
    const pluginArch = this.isUnicodeEnabled ? "x86-unicode" : "x86-ansi"
    scriptHeader += `!addplugindir /${pluginArch} "${path.join(await nsisResourcePathPromise, "plugins", pluginArch)}"\n`
    scriptHeader += `!addplugindir /${pluginArch} "${path.join(packager.buildResourcesDir, pluginArch)}"\n`

    if (this.isPortable) {
      return scriptHeader + originalScript
    }

    const customInclude = await packager.getResource(this.options.include, "installer.nsh")
    if (customInclude != null) {
      scriptHeader += `!addincludedir "${packager.buildResourcesDir}"\n`
      scriptHeader += `!include "${customInclude}"\n\n`
    }

    const fileAssociations = packager.fileAssociations
    if (fileAssociations.length !== 0) {
      if (this.options.perMachine !== true) {
        // https://github.com/electron-userland/electron-builder/issues/772
        throw new Error(`Please set perMachine to true — file associations works on Windows only if installed for all users`)
      }

      scriptHeader += "!include FileAssociation.nsh\n"
      if (isInstaller) {
        let registerFileAssociationsScript = ""
        for (const item of fileAssociations) {
          const extensions = asArray(item.ext).map(normalizeExt)
          for (const ext of extensions) {
            const customIcon = await packager.getResource(getPlatformIconFileName(item.icon, false), `${extensions[0]}.ico`)
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
        scriptHeader += `!macro registerFileAssociations\n${registerFileAssociationsScript}!macroend\n`
      }
      else {
        let unregisterFileAssociationsScript = ""
        for (const item of fileAssociations) {
          for (const ext of asArray(item.ext)) {
            unregisterFileAssociationsScript += `  !insertmacro APP_UNASSOCIATE "${normalizeExt(ext)}" "${item.name || ext}"\n`
          }
        }
        scriptHeader += `!macro unregisterFileAssociations\n${unregisterFileAssociationsScript}!macroend\n`
      }
    }

    return scriptHeader + originalScript
  }
}