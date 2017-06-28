import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import _debug from "debug"
import { asArray, debug7zArgs, doSpawn, getPlatformIconFileName, handleProcess, isEmptyOrSpaces, log, spawn, subTask, use, warn } from "electron-builder-util"
import { getBinFromGithub } from "electron-builder-util/out/binDownload"
import { copyFile } from "electron-builder-util/out/fs"
import { outputFile, readFile, unlink, writeFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { v5 as uuid5 } from "uuid-1345"
import { Arch, Target } from "../core"
import { NsisOptions, PortableOptions } from "../options/winOptions"
import { normalizeExt } from "../platformPackager"
import { AsyncTaskManager } from "../util/asyncTaskManager"
import { time } from "../util/timer"
import { execWine } from "../util/wine"
import { WinPackager } from "../winPackager"
import { addZipArgs, archive, ArchiveOptions } from "./archive"
import { computeBlockMap } from "./blockMap"
import { bundledLanguages, getLicenseFiles, lcid, toLangWithRegion } from "./license"

const debug = _debug("electron-builder:nsis")

// noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

// noinspection SpellCheckingInspection
const nsisPathPromise = getBinFromGithub("nsis", "3.0.1.13", "2921dd404ce9b69679088a6f1409a56dd360da2077fe1019573c0712c9edf057")
// noinspection SpellCheckingInspection
const nsisResourcePathPromise = getBinFromGithub("nsis-resources", "3.0.0", "cde0e77b249e29d74250bf006aa355d3e02b32226e1c6431fb48facae41d8a7e")

const USE_NSIS_BUILT_IN_COMPRESSOR = false

interface PackageFileInfo {
  file: string
}

export class AppPackageHelper {
  private readonly archToFileInfo = new Map<Arch, Promise<PackageFileInfo>>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  async packArch(arch: Arch, target: NsisTarget) {
    let infoPromise = this.archToFileInfo.get(arch)
    if (infoPromise == null) {
      infoPromise = subTask(`Packaging NSIS installer for arch ${Arch[arch]}`, target.buildAppPackage(target.archs.get(arch)!, arch))
        .then(it => {return {file: it} })
      this.archToFileInfo.set(arch, infoPromise)
    }

    const info = await infoPromise
    if (target.isWebInstaller) {
      this.infoToIsDelete.set(info, false)
    }
    else if (!this.infoToIsDelete.has(info)) {
      this.infoToIsDelete.set(info, true)
    }
    return info.file
  }

  async finishBuild(): Promise<any> {
    if (--this.refCount > 0) {
      return
    }

    const filesToDelete: Array<string> = []
    for (let [info, isDelete]  of this.infoToIsDelete.entries()) {
      if (isDelete) {
        filesToDelete.push(info.file)
      }
    }

    await BluebirdPromise.map(filesToDelete, it => unlink(it))
  }
}

export class NsisTarget extends Target {
  readonly options: NsisOptions

  /** @private */
  readonly archs: Map<Arch, string> = new Map()

  private readonly nsisTemplatesDir = path.join(__dirname, "..", "..", "templates", "nsis")

  constructor(protected readonly packager: WinPackager, readonly outDir: string, targetName: string, protected readonly packageHelper: AppPackageHelper) {
    super(targetName)

    this.packageHelper.refCount++

    this.options = targetName === "portable" ? Object.create(null) : Object.assign(Object.create(null), this.packager.config.nsis)
    if (targetName !== "nsis") {
      Object.assign(this.options, (<any>this.packager.config)[targetName === "nsis-web" ? "nsisWeb" : targetName])
    }

    const deps = packager.info.metadata.dependencies
    if (deps != null && deps["electron-squirrel-startup"] != null) {
      warn('"electron-squirrel-startup" dependency is not required for NSIS')
    }
  }

  async build(appOutDir: string, arch: Arch) {
    this.archs.set(arch, appOutDir)
  }

  /** @private */
  async buildAppPackage(appOutDir: string, arch: Arch) {
    const options = this.options
    const packager = this.packager

    let isPackElevateHelper = options.packElevateHelper
    if (isPackElevateHelper === false && options.perMachine === true) {
      isPackElevateHelper = true
      warn("`packElevateHelper = false` is ignored, because `perMachine` is set to `true`")
    }

    if (isPackElevateHelper !== false) {
      await copyFile(path.join(await nsisPathPromise, "elevate.exe"), path.join(appOutDir, "resources", "elevate.exe"), false)
    }

    const isDifferentialPackage = options.differentialPackage
    const format = isDifferentialPackage || options.useZip ? "zip" : "7z"
    const archiveFile = path.join(this.outDir, `${packager.appInfo.name}-${packager.appInfo.version}-${Arch[arch]}.nsis.${format}`)
    const archiveOptions: ArchiveOptions = {withoutDir: true, solid: !isDifferentialPackage}
    let compression = packager.config.compression

    const timer = time(`nsis package, ${Arch[arch]}`)
    if (isDifferentialPackage) {
      // reduce dict size to avoid large block invalidation on change
      archiveOptions.dictSize = 16
      archiveOptions.method = "LZMA"
      // do not allow to change compression level to avoid different packages
      compression = null
    }
    await archive(compression, format, archiveFile, appOutDir, archiveOptions)
    timer.end()

    if (options.differentialPackage) {
      const args = debug7zArgs("a")
      addZipArgs(args)
      args.push(`-mm=${archiveOptions.method}`, "-mx=9")
      args.push(archiveFile)

      const blockMap = await computeBlockMap(appOutDir)
      const blockMapFile = path.join(this.outDir, `${packager.appInfo.name}-${packager.appInfo.version}-${Arch[arch]}.blockMap.yml`)
      await writeFile(blockMapFile, blockMap)
      await spawn(path7za, args.concat(blockMapFile), {
        cwd: this.outDir,
      })
    }

    return archiveFile
  }

  // noinspection JSUnusedGlobalSymbols
  async finishBuild(): Promise<any> {
    log("Building NSIS installer")
    try {
      await this.buildInstaller()
    }
    finally {
      await this.packageHelper.finishBuild()
    }
  }

  protected get installerFilenamePattern(): string {
    return "${productName} " + (this.isPortable ? "" : "Setup ") + "${version}.${ext}"
  }

  private get isPortable() {
    return this.name === "portable"
  }

  private async buildInstaller(): Promise<any> {
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
    const companyName = appInfo.companyName
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      PRODUCT_NAME: appInfo.productName,
      PRODUCT_FILENAME: appInfo.productFilename,
      APP_FILENAME: (!oneClick || options.perMachine === true) && /^[-_+0-9a-zA-Z ]+$/.test(appInfo.productFilename) ? appInfo.productFilename : appInfo.name,
      APP_DESCRIPTION: appInfo.description,
      VERSION: version,

      PROJECT_DIR: packager.projectDir,
      BUILD_RESOURCES_DIR: packager.buildResourcesDir,
    }

    if (companyName != null) {
      defines.COMPANY_NAME = companyName
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
        const file = await this.packageHelper.packArch(arch, this, )
        defines[arch === Arch.x64 ? "APP_64" : "APP_32"] = file
        defines[(arch === Arch.x64 ? "APP_64" : "APP_32") + "_NAME"] = path.basename(file)

        if (this.isWebInstaller) {
          packager.dispatchArtifactCreated(file, this, arch)
        }
      })
    }

    this.configureDefinesForAllTypeOfInstaller(defines)
    if (isPortable) {
      defines.REQUEST_EXECUTION_LEVEL = (<PortableOptions>options).requestExecutionLevel || "user"
    }
    else {
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

    packager.dispatchArtifactCreated(installerPath, this, this.archs.size === 1 ? this.archs.keys().next().value : null, this.generateGitHubInstallerName())
  }

  protected generateGitHubInstallerName() {
    const appInfo = this.packager.appInfo
    const classifier = appInfo.name.toLowerCase() === appInfo.name ? "setup-" : "Setup-"
    return `${appInfo.name}-${this.isPortable ? "" : classifier}${appInfo.version}.exe`
  }

  private get isUnicodeEnabled() {
    return this.options.unicode == null ? true : this.options.unicode
  }

  get isWebInstaller(): boolean {
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
    await execWine(installerPath, [])
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
      `/LANG=${localeId} LegalCopyright "${appInfo.copyright}"`,
      `/LANG=${localeId} FileDescription "${appInfo.description}"`,
      `/LANG=${localeId} FileVersion "${appInfo.buildVersion}"`,
    ]
    use(this.packager.platformSpecificBuildOptions.legalTrademarks, it => versionKey.push(`/LANG=${localeId} LegalTrademarks "${it}"`))
    use(appInfo.companyName, it => versionKey.push(`/LANG=${localeId} CompanyName "${it}"`))
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

    if (options.menuCategory != null && options.menuCategory !== false) {
      let menu: string
      if (options.menuCategory === true) {
        const companyName = packager.appInfo.companyName
        if (companyName == null) {
          throw new Error(`Please specify "author" in the application package.json — it is required because "menuCategory" is set to true.`)
        }
        menu = sanitizeFileName(companyName)
      }
      else {
        menu = (<string>options.menuCategory).split(/[\/\\]/).map(it => sanitizeFileName(it)).join("\\")
      }
      if (!isEmptyOrSpaces(menu)) {
        defines.MENU_FILENAME = menu
      }
    }

    if (options.multiLanguageInstaller == null ? this.isUnicodeEnabled : options.multiLanguageInstaller) {
      defines.MULTI_LANGUAGE_INSTALLER = null
    }

    if (options.deleteAppDataOnUninstall) {
      defines.DELETE_APP_DATA_ON_UNINSTALL = null
    }

    const uninstallerIcon = await packager.getResource(options.uninstallerIcon, "uninstallerIcon.ico")
    if (uninstallerIcon != null) {
      // we don't need to copy MUI_UNICON (defaults to app icon), so, we have 2 defines
      defines.UNINSTALLER_ICON = uninstallerIcon
      defines.MUI_UNICON = uninstallerIcon
    }

    defines.UNINSTALL_DISPLAY_NAME = packager.expandMacro(options.uninstallDisplayName || "${productName} ${version}", null, {}, false)
    if (options.createDesktopShortcut === false) {
      defines.DO_NOT_CREATE_DESKTOP_SHORTCUT = null
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
        // set LC_CTYPE to avoid crash https://github.com/electron-userland/electron-builder/issues/503 Even "en_DE.UTF-8" leads to error.
        env: Object.assign({}, process.env, {NSISDIR: nsisPath, LC_CTYPE: "en_US.UTF-8"}),
        cwd: this.nsisTemplatesDir,
      }, {isPipeInput: true, isDebugEnabled: debug.enabled})

      const timeout = setTimeout(() => childProcess.kill(), 4 * 60 * 1000)

      handleProcess("close", childProcess, command, () => {
        try {
          clearTimeout(timeout)
        }
        finally {
          resolve()
        }
      }, error => {
        try {
          clearTimeout(timeout)
        }
        finally {
          reject(error + "\nNSIS script:\n" + script)
        }
      })

      childProcess.stdin.end(script)
    })
  }

  private async writeCustomLangFile(data: string) {
    const file = await this.packager.getTempFile("messages.nsh")
    await outputFile(file, data)
    return file
  }

  private async computeFinalScript(originalScript: string, isInstaller: boolean) {
    const packager = this.packager
    let scriptHeader = `!addincludedir "${path.join(__dirname, "..", "..", "templates", "nsis", "include")}"\n`

    const addCustomMessageFileInclude = async (input: string) => {
      const data = computeCustomMessageTranslations(safeLoad(await readFile(path.join(this.nsisTemplatesDir, input), "utf-8"))).join("\n")
      debug(data)
      return '!include "' + await this.writeCustomLangFile(data) + '"\n'
    }

    const taskManager = new AsyncTaskManager(packager.info.cancellationToken)

    taskManager.add(async () => {
      const pluginArch = this.isUnicodeEnabled ? "x86-unicode" : "x86-ansi"
      let result = `!addplugindir /${pluginArch} "${path.join(await nsisResourcePathPromise, "plugins", pluginArch)}"\n`
      result += `!addplugindir /${pluginArch} "${path.join(packager.buildResourcesDir, pluginArch)}"\n`
      return result
    })

    taskManager.add(async () => {
      // http://stackoverflow.com/questions/997456/nsis-license-file-based-on-language-selection
      const licensePage = await this.computeLicensePage()
      return licensePage == null ? "" : createMacro("licensePage", licensePage)
    })

    taskManager.addTask(addCustomMessageFileInclude("messages.yml"))

    if (!this.isPortable) {
      if (this.options.oneClick === false) {
        taskManager.addTask(addCustomMessageFileInclude("boringMessages.yml"))
      }

      taskManager.add(async () => {
        let result = ""
        const customInclude = await packager.getResource(this.options.include, "installer.nsh")
        if (customInclude != null) {
          result += `!addincludedir "${packager.buildResourcesDir}"\n`
          result += `!include "${customInclude}"\n\n`
        }
        return result
      })
    }

    for (const s of await taskManager.awaitTasks()) {
      scriptHeader += s
    }

    if (this.isPortable) {
      return scriptHeader + originalScript
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

  private async computeLicensePage(): Promise<Array<string> | null> {
    const packager = this.packager

    const license = await packager.getResource(this.options.license, "license.rtf", "license.txt", "eula.rtf", "eula.txt", "LICENSE.rtf", "LICENSE.txt", "EULA.rtf", "EULA.txt", "LICENSE.RTF", "LICENSE.TXT", "EULA.RTF", "EULA.TXT")
    if (license != null) {
      return [`!insertmacro MUI_PAGE_LICENSE "${license}"`]
    }

    const licenseFiles = await getLicenseFiles(packager)
    if (licenseFiles.length === 0) {
      return null
    }

    const licensePage: Array<string> = []
    const unspecifiedLangs = new Set(bundledLanguages)

    let defaultFile: string | null = null
    for (const item of licenseFiles) {
      unspecifiedLangs.delete(item.langWithRegion)
      if (defaultFile == null) {
        defaultFile = item.file
      }
      licensePage.push(`LicenseLangString MUILicense ${lcid[item.langWithRegion] || item.lang} "${item.file}"`)
    }

    for (const l of unspecifiedLangs) {
      licensePage.push(`LicenseLangString MUILicense ${lcid[l]} "${defaultFile}"`)
    }

    licensePage.push('!insertmacro MUI_PAGE_LICENSE "$(MUILicense)"')
    return licensePage
  }
}

function computeCustomMessageTranslations(messages: any): Array<string> {
  const result: Array<string> = []
  for (const messageId of Object.keys(messages)) {
    const langToTranslations = messages[messageId]
    const unspecifiedLangs = new Set(bundledLanguages)
    for (const lang of Object.keys(langToTranslations)) {
      const langWithRegion = toLangWithRegion(lang)
      result.push(`LangString ${messageId} ${lcid[langWithRegion]} "${langToTranslations[lang].replace(/\n/g, "$\\r$\\n")}"`)
      unspecifiedLangs.delete(langWithRegion)
    }

    const defaultTranslation = langToTranslations["en"].replace(/\n/g, "$\\r$\\n")
    for (const langWithRegion of unspecifiedLangs) {
      result.push(`LangString ${messageId} ${lcid[langWithRegion]} "${defaultTranslation}"`)
    }
  }
  return result
}

function createMacro(name: string, lines: Array<string>) {
  return `\n!macro ${name}\n  ${lines.join("\n  ")}\n!macroend\n`
}
