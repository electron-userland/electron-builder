import { createDifferentialPackage, createPackageFileInfo } from "app-package-builder"
import BluebirdPromise from "bluebird-lst"
import { Arch, asArray, AsyncTaskManager, execWine, getPlatformIconFileName, log, spawnAndWrite, use, warn } from "builder-util"
import { PackageFileInfo, UUID } from "builder-util-runtime"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { statOrNull } from "builder-util/out/fs"
import _debug from "debug"
import { readFile, unlink, writeFile } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../../core"
import { isSafeGithubName, normalizeExt } from "../../platformPackager"
import { time } from "../../util/timer"
import { WinPackager } from "../../winPackager"
import { archive, ArchiveOptions } from "../archive"
import { addCustomMessageFileInclude, createAddLangsMacro, LangConfigurator } from "./nsisLang"
import { computeLicensePage } from "./nsisLicense"
import { NsisOptions, PortableOptions } from "./nsisOptions"
import { NsisScriptGenerator } from "./nsisScriptGenerator"
import { AppPackageHelper, NSIS_PATH, nsisTemplatesDir } from "./nsisUtil"
import { getEffectiveOptions } from "../../options/CommonWindowsInstallerConfiguration"

const debug = _debug("electron-builder:nsis")

// noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3")

// noinspection SpellCheckingInspection
const nsisResourcePathPromise = new Lazy(() => getBinFromGithub("nsis-resources", "3.3.0", "4okc98BD0v9xDcSjhPVhAkBMqos+FvD/5/H72fTTIwoHTuWd2WdD7r+1j72hxd+ZXxq1y3FRW0x6Z3jR0VfpMw=="))

const USE_NSIS_BUILT_IN_COMPRESSOR = false

export class NsisTarget extends Target {
  readonly options: NsisOptions

  /** @private */
  readonly archs: Map<Arch, string> = new Map()

  constructor(protected readonly packager: WinPackager, readonly outDir: string, targetName: string, protected readonly packageHelper: AppPackageHelper) {
    super(targetName)

    this.packageHelper.refCount++

    this.options = targetName === "portable" ? Object.create(null) : {...this.packager.config.nsis}
    if (targetName !== "nsis") {
      Object.assign(this.options, (this.packager.config as any)[targetName === "nsis-web" ? "nsisWeb" : targetName])
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
  async buildAppPackage(appOutDir: string, arch: Arch): Promise<PackageFileInfo> {
    const options = this.options
    const packager = this.packager

    const isDifferentialPackage = options.differentialPackage
    const format = !isDifferentialPackage && options.useZip ? "zip" : "7z"
    const archiveFile = path.join(this.outDir, `${packager.appInfo.sanitizedName}-${packager.appInfo.version}-${Arch[arch]}.nsis.${format}`)
    const archiveOptions: ArchiveOptions = {withoutDir: true}
    let compression = packager.compression

    const timer = time(`nsis package, ${Arch[arch]}`)
    if (isDifferentialPackage) {
      archiveOptions.solid = false
      // our reader doesn't support compressed headers
      archiveOptions.isArchiveHeaderCompressed = false
      /*
       * dict size 64 MB: Full: 33,744.88 KB, To download: 17,630.3 KB (52%)
       * dict size 16 MB: Full: 33,936.84 KB, To download: 16,175.9 KB (48%)
       * dict size  8 MB: Full: 34,187.59 KB, To download:  8,229.9 KB (24%)
       * dict size  4 MB: Full: 34,628.73 KB, To download: 3,782.97 KB (11%)

       as we can see, if file changed in one place, all block is invalidated (and update size approximately equals to dict size)
       */
      archiveOptions.dictSize = 4
      // do not allow to change compression level to avoid different packages
      compression = "normal"
    }
    await archive(compression, format, archiveFile, appOutDir, archiveOptions)
    timer.end()

    if (options.differentialPackage) {
      return await createDifferentialPackage(archiveFile)
    }
    else {
      return await createPackageFileInfo(archiveFile, 0)
    }
  }

  // noinspection JSUnusedGlobalSymbols
  async finishBuild(): Promise<any> {
    log(`Building ${this.name} installer (${Array.from(this.archs.keys()).map(it => Arch[it]).join(" and ")})`)
    try {
      await this.buildInstaller()
    }
    finally {
      await this.packageHelper.finishBuild()
    }
  }

  protected get installerFilenamePattern(): string {
    // tslint:disable:no-invalid-template-strings
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
    const guid = options.guid || UUID.v5(appInfo.id, ELECTRON_BUILDER_NS_UUID)
    const companyName = appInfo.companyName
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      PRODUCT_NAME: appInfo.productName,
      PRODUCT_FILENAME: appInfo.productFilename,
      APP_FILENAME: (!oneClick || options.perMachine === true) && /^[-_+0-9a-zA-Z ]+$/.test(appInfo.productFilename) ? appInfo.productFilename : appInfo.sanitizedName,
      APP_DESCRIPTION: appInfo.description,
      VERSION: version,

      PROJECT_DIR: packager.projectDir,
      BUILD_RESOURCES_DIR: packager.buildResourcesDir,
    }

    if (companyName != null) {
      defines.COMPANY_NAME = companyName
    }

    // electron uses product file name as app data, define it as well to remove on uninstall
    if (defines.APP_FILENAME !== appInfo.productFilename) {
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
        commands.Icon = `"${iconPath}"`
      }
      else {
        defines.MUI_ICON = iconPath
        defines.MUI_UNICON = iconPath
      }
    }

    const packageFiles: { [arch: string]: PackageFileInfo } = {}
    if (USE_NSIS_BUILT_IN_COMPRESSOR && this.archs.size === 1) {
      defines.APP_BUILD_DIR = this.archs.get(this.archs.keys().next().value)
    }
    else {
      await BluebirdPromise.map(this.archs.keys(), async arch => {
        const fileInfo = await this.packageHelper.packArch(arch, this)
        const file = fileInfo.path
        const defineKey = arch === Arch.x64 ? "APP_64" : "APP_32"
        defines[defineKey] = file
        defines[`${defineKey}_NAME`] = path.basename(file)
        // nsis expect a hexadecimal string
        defines[`${defineKey}_HASH`] = Buffer.from(fileInfo.sha512, "base64").toString("hex").toUpperCase()

        if (fileInfo.blockMapData != null) {
          const blockMapFile = await packager.getTempFile(".yml")
          await writeFile(blockMapFile, fileInfo.blockMapData)
          defines[`${defineKey}_BLOCK_MAP_FILE`] = blockMapFile
          delete fileInfo.blockMapData
        }

        if (this.isWebInstaller) {
          packager.dispatchArtifactCreated(file, this, arch)
          packageFiles[Arch[arch]] = fileInfo
        }
      })
    }

    this.configureDefinesForAllTypeOfInstaller(defines)
    if (isPortable) {
      defines.REQUEST_EXECUTION_LEVEL = (options as PortableOptions).requestExecutionLevel || "user"
    }
    else {
      await this.configureDefines(oneClick, defines)
    }

    if (packager.compression === "store") {
      commands.SetCompress = "off"
    }
    else {
      // investigate https://github.com/electron-userland/electron-builder/issues/2134#issuecomment-333286194
      // difference - 33.540 vs 33.601, only 61 KB
      commands.SetCompressor = "zlib"
      if (!this.isWebInstaller) {
        defines.COMPRESS = "auto"
      }
    }

    debug(defines)
    debug(commands)

    if (packager.packagerOptions.effectiveOptionComputed != null && await packager.packagerOptions.effectiveOptionComputed([defines, commands])) {
      return
    }

    const sharedHeader = await this.computeCommonInstallerScriptHeader()
    const script = isPortable ? await readFile(path.join(nsisTemplatesDir, "portable.nsi"), "utf8") : await this.computeScriptAndSignUninstaller(defines, commands, installerPath, sharedHeader)
    await this.executeMakensis(defines, commands, sharedHeader + await this.computeFinalScript(script, true))
    await BluebirdPromise.all<any>([packager.sign(installerPath), defines.UNINSTALLER_OUT_FILE == null ? BluebirdPromise.resolve() : unlink(defines.UNINSTALLER_OUT_FILE)])

    let updateInfo: any = null
    if (packageFiles != null) {
      const keys = Object.keys(packageFiles)
      if (keys.length > 0) {
        const packages: { [arch: string]: PackageFileInfo } = {}
        for (const arch of keys) {
          const packageFileInfo = packageFiles[arch]
          packages[arch] = {
            ...packageFileInfo,
            path: path.basename(packageFileInfo.path)
          }
        }
        updateInfo = {packages}
      }
    }

    packager.info.dispatchArtifactCreated({
      file: installerPath,
      updateInfo,
      target: this,
      packager,
      arch: this.archs.size === 1 ? this.archs.keys().next().value : null,
      safeArtifactName: isSafeGithubName(installerFilename) ? installerFilename : this.generateGitHubInstallerName(),
      isWriteUpdateInfo: !this.isPortable,
    })
  }

  protected generateGitHubInstallerName() {
    const appInfo = this.packager.appInfo
    const classifier = appInfo.name.toLowerCase() === appInfo.name ? "setup-" : "Setup-"
    return `${appInfo.name}-${this.isPortable ? "" : classifier}${appInfo.version}.exe`
  }

  private get isUnicodeEnabled() {
    return this.options.unicode !== false
  }

  get isWebInstaller(): boolean {
    return false
  }

  private async computeScriptAndSignUninstaller(defines: any, commands: any, installerPath: string, sharedHeader: string) {
    const packager = this.packager
    const customScriptPath = await packager.getResource(this.options.script, "installer.nsi")
    const script = await readFile(customScriptPath || path.join(nsisTemplatesDir, "installer.nsi"), "utf8")

    if (customScriptPath != null) {
      log("Custom NSIS script is used - uninstaller is not signed by electron-builder")
      return script
    }

    // https://github.com/electron-userland/electron-builder/issues/2103
    // it is more safe and reliable to write uninstaller to our out dir
    const uninstallerPath = path.join(this.outDir, `.__uninstaller-${this.name}-${this.packager.appInfo.sanitizedName}.exe`)
    const isWin = process.platform === "win32"
    defines.BUILD_UNINSTALLER = null
    defines.UNINSTALLER_OUT_FILE = isWin ? uninstallerPath : path.win32.join("Z:", uninstallerPath)
    await this.executeMakensis(defines, commands, sharedHeader + await this.computeFinalScript(script, false))
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

  protected configureDefines(oneClick: boolean, defines: any): Promise<any> {
    const packager = this.packager
    const options = this.options

    const asyncTaskManager = new AsyncTaskManager(packager.info.cancellationToken)

    if (oneClick) {
      defines.ONE_CLICK = null

      if (options.runAfterFinish !== false) {
        defines.RUN_AFTER_FINISH = null
      }

      asyncTaskManager.add(async () => {
        const installerHeaderIcon = await packager.getResource(options.installerHeaderIcon, "installerHeaderIcon.ico")
        if (installerHeaderIcon != null) {
          defines.HEADER_ICO = installerHeaderIcon
        }
      })
    }
    else {
      asyncTaskManager.add(async () => {
        const installerHeader = await packager.getResource(options.installerHeader, "installerHeader.bmp")
        if (installerHeader != null) {
          defines.MUI_HEADERIMAGE = null
          defines.MUI_HEADERIMAGE_RIGHT = null
          defines.MUI_HEADERIMAGE_BITMAP = installerHeader
        }
      })

      asyncTaskManager.add(async () => {
        const bitmap = (await packager.getResource(options.installerSidebar, "installerSidebar.bmp")) || "${NSISDIR}\\Contrib\\Graphics\\Wizard\\nsis3-metro.bmp"
        defines.MUI_WELCOMEFINISHPAGE_BITMAP = bitmap
        defines.MUI_UNWELCOMEFINISHPAGE_BITMAP = (await packager.getResource(options.uninstallerSidebar, "uninstallerSidebar.bmp")) || bitmap
      })

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
        throw new Error("allowToChangeInstallationDirectory makes sense only for assisted installer (please set oneClick to false)")
      }
      defines.allowToChangeInstallationDirectory = null
    }

    const commonOptions = getEffectiveOptions(options, packager)

    if (commonOptions.menuCategory != null) {
      defines.MENU_FILENAME = commonOptions.menuCategory
    }

    defines.SHORTCUT_NAME = commonOptions.shortcutName

    if (options.deleteAppDataOnUninstall) {
      defines.DELETE_APP_DATA_ON_UNINSTALL = null
    }

    asyncTaskManager.add(async () => {
      const uninstallerIcon = await packager.getResource(options.uninstallerIcon, "uninstallerIcon.ico")
      if (uninstallerIcon != null) {
        // we don't need to copy MUI_UNICON (defaults to app icon), so, we have 2 defines
        defines.UNINSTALLER_ICON = uninstallerIcon
        defines.MUI_UNICON = uninstallerIcon
      }
    })

    defines.UNINSTALL_DISPLAY_NAME = packager.expandMacro(options.uninstallDisplayName || "${productName} ${version}", null, {}, false)
    if (!commonOptions.isCreateDesktopShortcut) {
      defines.DO_NOT_CREATE_DESKTOP_SHORTCUT = null
    }
    if (!commonOptions.isCreateStartMenuShortcut) {
      defines.DO_NOT_CREATE_START_MENU_SHORTCUT = null
    }

    if (options.displayLanguageSelector === true) {
      defines.DISPLAY_LANG_SELECTOR = null
    }

    return asyncTaskManager.awaitTasks()
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

    if (this.packager.debugLogger.enabled) {
      this.packager.debugLogger.add("nsis.script", script)
    }

    const nsisPath = await NSIS_PATH.value
    const command = path.join(nsisPath, process.platform === "darwin" ? "mac" : (process.platform === "win32" ? "Bin" : "linux"), process.platform === "win32" ? "makensis.exe" : "makensis")
    await spawnAndWrite(command, args, script, {
      // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as MacOS/Windows version, so, we explicitly set NSISDIR
      env: {...process.env, NSISDIR: nsisPath},
      cwd: nsisTemplatesDir,
    }, debug.enabled)
  }

  private async computeCommonInstallerScriptHeader() {
    const packager = this.packager
    const options = this.options
    const scriptGenerator = new NsisScriptGenerator()
    const langConfigurator = new LangConfigurator(options)

    scriptGenerator.include(path.join(nsisTemplatesDir, "include", "StdUtils.nsh"))

    const includeDir = path.join(nsisTemplatesDir, "include")
    scriptGenerator.addIncludeDir(includeDir)
    scriptGenerator.flags(["updated", "force-run", "keep-shortcuts", "no-desktop-shortcut", "delete-app-data"])

    createAddLangsMacro(scriptGenerator, langConfigurator)

    const taskManager = new AsyncTaskManager(packager.info.cancellationToken)

    const pluginArch = this.isUnicodeEnabled ? "x86-unicode" : "x86-ansi"
    taskManager.add(async () => {
      scriptGenerator.addPluginDir(pluginArch, path.join(await nsisResourcePathPromise.value, "plugins", pluginArch))
    })

    taskManager.add(async () => {
      const userPluginDir = path.join(packager.buildResourcesDir, pluginArch)
      const stat = await statOrNull(userPluginDir)
      if (stat != null && stat.isDirectory()) {
        scriptGenerator.addPluginDir(pluginArch, userPluginDir)
      }
    })

    taskManager.addTask(addCustomMessageFileInclude("messages.yml", packager, scriptGenerator, langConfigurator))

    if (!this.isPortable) {
      if (options.oneClick === false) {
        taskManager.addTask(addCustomMessageFileInclude("assistedMessages.yml", packager, scriptGenerator, langConfigurator))
      }

      taskManager.add(async () => {
        const customInclude = await packager.getResource(this.options.include, "installer.nsh")
        if (customInclude != null) {
          scriptGenerator.addIncludeDir(packager.buildResourcesDir)
          scriptGenerator.include(customInclude)
        }
      })
    }

    await taskManager.awaitTasks()
    return scriptGenerator.build()
  }

  private async computeFinalScript(originalScript: string, isInstaller: boolean) {
    const packager = this.packager
    const options = this.options
    const langConfigurator = new LangConfigurator(options)

    const scriptGenerator = new NsisScriptGenerator()
    const taskManager = new AsyncTaskManager(packager.info.cancellationToken)

    if (isInstaller) {
      // http://stackoverflow.com/questions/997456/nsis-license-file-based-on-language-selection
      taskManager.add(() => computeLicensePage(packager, options, scriptGenerator, langConfigurator.langs))
    }

    await taskManager.awaitTasks()

    if (this.isPortable) {
      return scriptGenerator.build() + originalScript
    }

    const fileAssociations = packager.fileAssociations
    if (fileAssociations.length !== 0) {
      if (options.perMachine !== true) {
        // https://github.com/electron-userland/electron-builder/issues/772
        throw new Error(`Please set perMachine to true — file associations works on Windows only if installed for all users`)
      }

      scriptGenerator.include(path.join(path.join(nsisTemplatesDir, "include"), "FileAssociation.nsh"))
      if (isInstaller) {
        const registerFileAssociationsScript = new NsisScriptGenerator()
        for (const item of fileAssociations) {
          const extensions = asArray(item.ext).map(normalizeExt)
          for (const ext of extensions) {
            const customIcon = await packager.getResource(getPlatformIconFileName(item.icon, false), `${extensions[0]}.ico`)
            let installedIconPath = "$appExe,0"
            if (customIcon != null) {
              installedIconPath = `$INSTDIR\\resources\\${path.basename(customIcon)}`
              registerFileAssociationsScript.file(installedIconPath, customIcon)
            }

            const icon = `"${installedIconPath}"`
            const commandText = `"Open with ${packager.appInfo.productName}"`
            const command = '"$appExe $\\"%1$\\""'
            registerFileAssociationsScript.insertMacro("APP_ASSOCIATE", `"${ext}" "${item.name || ext}" "${item.description || ""}" ${icon} ${commandText} ${command}`)
          }
        }
        scriptGenerator.macro("registerFileAssociations", registerFileAssociationsScript)
      }
      else {
        const unregisterFileAssociationsScript = new NsisScriptGenerator()
        for (const item of fileAssociations) {
          for (const ext of asArray(item.ext)) {
            unregisterFileAssociationsScript.insertMacro("APP_UNASSOCIATE", `"${normalizeExt(ext)}" "${item.name || ext}"`)
          }
        }
        scriptGenerator.macro("unregisterFileAssociations", unregisterFileAssociationsScript)
      }
    }

    return scriptGenerator.build() + originalScript
  }
}