import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { executeAppBuilder, Arch, asArray, AsyncTaskManager, getPlatformIconFileName, InvalidConfigurationError, log, spawnAndWrite, use, exec } from "builder-util"
import { PackageFileInfo, UUID, CURRENT_APP_PACKAGE_FILE_NAME, CURRENT_APP_INSTALLER_FILE_NAME } from "builder-util-runtime"
import { getBinFromUrl } from "../../binDownload"
import { statOrNull, walk, exists } from "builder-util/out/fs"
import { hashFile } from "../../util/hash"
import _debug from "debug"
import { readFile, stat, unlink } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Target } from "../../core"
import { DesktopShortcutCreationPolicy, getEffectiveOptions } from "../../options/CommonWindowsInstallerConfiguration"
import { computeSafeArtifactNameIfNeeded, normalizeExt } from "../../platformPackager"
import { isMacOsCatalina } from "../../util/macosVersion"
import { time } from "../../util/timer"
import { execWine } from "../../wine"
import { WinPackager } from "../../winPackager"
import { archive, ArchiveOptions } from "../archive"
import { appendBlockmap, configureDifferentialAwareArchiveOptions, createBlockmap, createNsisWebDifferentialUpdateInfo } from "../differentialUpdateInfoBuilder"
import { getWindowsInstallationDirName } from "../targetUtil"
import { addCustomMessageFileInclude, createAddLangsMacro, LangConfigurator } from "./nsisLang"
import { computeLicensePage } from "./nsisLicense"
import { NsisOptions, PortableOptions } from "./nsisOptions"
import { NsisScriptGenerator } from "./nsisScriptGenerator"
import { AppPackageHelper, NSIS_PATH, nsisTemplatesDir } from "./nsisUtil"

const debug = _debug("electron-builder:nsis")

// noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3")

// noinspection SpellCheckingInspection
const nsisResourcePathPromise = new Lazy(() => getBinFromUrl("nsis-resources", "3.4.1", "Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q=="))

const USE_NSIS_BUILT_IN_COMPRESSOR = false

export class NsisTarget extends Target {
  readonly options: NsisOptions

  /** @private */
  readonly archs: Map<Arch, string> = new Map()

  constructor(readonly packager: WinPackager, readonly outDir: string, targetName: string, protected readonly packageHelper: AppPackageHelper) {
    super(targetName)

    this.packageHelper.refCount++

    this.options = targetName === "portable" ? Object.create(null) : {
      preCompressedFileExtensions: [".avi", ".mov", ".m4v", ".mp4", ".m4p", ".qt", ".mkv", ".webm", ".vmdk"],
      ...this.packager.config.nsis,
    }

    if (targetName !== "nsis") {
      Object.assign(this.options, (this.packager.config as any)[targetName === "nsis-web" ? "nsisWeb" : targetName])
    }

    const deps = packager.info.metadata.dependencies
    if (deps != null && deps["electron-squirrel-startup"] != null) {
      log.warn('"electron-squirrel-startup" dependency is not required for NSIS')
    }
  }

  async build(appOutDir: string, arch: Arch) {
    this.archs.set(arch, appOutDir)
  }

  get isBuildDifferentialAware() {
    return !this.isPortable && this.options.differentialPackage !== false
  }

  private getPreCompressedFileExtensions(): Array<string> | null {
    const result = this.isWebInstaller ? null : this.options.preCompressedFileExtensions
    return result == null ? null : asArray(result).map(it => it.startsWith(".") ? it : `.${it}`)
  }

  /** @private */
  async buildAppPackage(appOutDir: string, arch: Arch): Promise<PackageFileInfo> {
    const options = this.options
    const packager = this.packager

    const isBuildDifferentialAware = this.isBuildDifferentialAware
    const format = !isBuildDifferentialAware && options.useZip ? "zip" : "7z"
    const archiveFile = path.join(this.outDir, `${packager.appInfo.sanitizedName}-${packager.appInfo.version}-${Arch[arch]}.nsis.${format}`)
    const preCompressedFileExtensions = this.getPreCompressedFileExtensions()
    const archiveOptions: ArchiveOptions = {
      withoutDir: true,
      compression: packager.compression,
      excluded: preCompressedFileExtensions == null ? null : preCompressedFileExtensions.map(it => `*${it}`)
    }

    const timer = time(`nsis package, ${Arch[arch]}`)
    await archive(format, archiveFile, appOutDir, isBuildDifferentialAware ? configureDifferentialAwareArchiveOptions(archiveOptions) : archiveOptions)
    timer.end()

    if (isBuildDifferentialAware && this.isWebInstaller) {
      const data = await appendBlockmap(archiveFile)
      return {
        ...data,
        path: archiveFile,
      }
    }
    else {
      return await createPackageFileInfo(archiveFile)
    }
  }

  async finishBuild(): Promise<any> {
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
    const packager = this.packager
    const appInfo = packager.appInfo
    const options = this.options
    const installerFilename = packager.expandArtifactNamePattern(options, "exe", null, this.installerFilenamePattern)
    const oneClick = options.oneClick !== false
    const installerPath = path.join(this.outDir, installerFilename)

    const logFields: any = {
      target: this.name,
      file: log.filePath(installerPath),
      archs: Array.from(this.archs.keys()).map(it => Arch[it]).join(", "),
    }
    const isPerMachine = options.perMachine === true
    if (!this.isPortable) {
      logFields.oneClick = oneClick
      logFields.perMachine = isPerMachine
    }

    await packager.info.callArtifactBuildStarted({
      targetPresentableName: this.name,
      file: installerPath,
      arch: null,
    }, logFields)

    const guid = options.guid || UUID.v5(appInfo.id, ELECTRON_BUILDER_NS_UUID)
    const uninstallAppKey = guid.replace(/\\/g, " - ")
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      // Windows bug - entry in Software\Microsoft\Windows\CurrentVersion\Uninstall cannot have \ symbols (dir)
      UNINSTALL_APP_KEY: uninstallAppKey,
      PRODUCT_NAME: appInfo.productName,
      PRODUCT_FILENAME: appInfo.productFilename,
      APP_FILENAME: getWindowsInstallationDirName(appInfo, !oneClick || isPerMachine),
      APP_DESCRIPTION: appInfo.description,
      VERSION: appInfo.version,

      PROJECT_DIR: packager.projectDir,
      BUILD_RESOURCES_DIR: packager.info.buildResourcesDir,

      APP_PACKAGE_NAME: appInfo.name
    }
    if (uninstallAppKey !== guid) {
      defines.UNINSTALL_REGISTRY_KEY_2 = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{${guid}}`
    }

    const commands: any = {
      OutFile: `"${installerPath}"`,
      VIProductVersion: appInfo.getVersionInWeirdWindowsForm(),
      VIAddVersionKey: this.computeVersionKey(),
      Unicode: this.isUnicodeEnabled,
    }

    const isPortable = this.isPortable
    const iconPath = (isPortable ? null : await packager.getResource(options.installerIcon, "installerIcon.ico")) || await packager.getIconPath()
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
    let estimatedSize = 0
    if (this.isPortable && options.useZip) {
      for (const [arch, dir] of this.archs.entries()) {
        defines[arch === Arch.x64 ? "APP_DIR_64" : (arch === Arch.arm64 ? "APP_DIR_ARM64" : "APP_DIR_32")] = dir
      }
    }
    else if (USE_NSIS_BUILT_IN_COMPRESSOR && this.archs.size === 1) {
      defines.APP_BUILD_DIR = this.archs.get(this.archs.keys().next().value)
    }
    else {
      await BluebirdPromise.map(this.archs.keys(), async arch => {
        const fileInfo = await this.packageHelper.packArch(arch, this)
        const file = fileInfo.path
        const defineKey = arch === Arch.x64 ? "APP_64" : (arch === Arch.arm64 ? "APP_ARM64" : "APP_32")
        defines[defineKey] = file
        defines[`${defineKey}_NAME`] = path.basename(file)
        // nsis expect a hexadecimal string
        defines[`${defineKey}_HASH`] = Buffer.from(fileInfo.sha512, "base64").toString("hex").toUpperCase()

        if (this.isWebInstaller) {
          await packager.dispatchArtifactCreated(file, this, arch)
          packageFiles[Arch[arch]] = fileInfo
        }

        const archiveInfo = (await exec(path7za, ["l", file])).trim()
        // after adding blockmap data will be "Warnings: 1" in the end of output
        const match = archiveInfo.match(/(\d+)\s+\d+\s+\d+\s+files/)
        if (match == null) {
          log.warn({output: archiveInfo}, "cannot compute size of app package")
        }
        else {
          estimatedSize += parseInt(match[1], 10)
        }
      })
    }

    this.configureDefinesForAllTypeOfInstaller(defines)
    if (isPortable) {
      const portableOptions = options as PortableOptions
      defines.REQUEST_EXECUTION_LEVEL = portableOptions.requestExecutionLevel || "user"
      defines.UNPACK_DIR_NAME = portableOptions.unpackDirName || (await executeAppBuilder(["ksuid"]))
    }
    else {
      await this.configureDefines(oneClick, defines)
    }

    if (estimatedSize !== 0) {
      // in kb
      defines.ESTIMATED_SIZE = Math.round(estimatedSize / 1024)
    }

    if (packager.compression === "store") {
      commands.SetCompress = "off"
    }
    else {
      // difference - 33.540 vs 33.601, only 61 KB (but zip is faster to decompress)
      // do not use /SOLID - "With solid compression, files are uncompressed to temporary file before they are copied to their final destination",
      // it is not good for portable installer (where built-in NSIS compression is used). http://forums.winamp.com/showpost.php?p=2982902&postcount=6
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
    await Promise.all<any>([packager.sign(installerPath), defines.UNINSTALLER_OUT_FILE == null ? Promise.resolve() : unlink(defines.UNINSTALLER_OUT_FILE)])

    const safeArtifactName = computeSafeArtifactNameIfNeeded(installerFilename, () => this.generateGitHubInstallerName())
    let updateInfo: any
    if (this.isWebInstaller) {
      updateInfo = createNsisWebDifferentialUpdateInfo(installerPath, packageFiles)
    }
    else if (this.isBuildDifferentialAware) {
      updateInfo = await createBlockmap(installerPath, this, packager, safeArtifactName)
    }

    if (updateInfo != null && isPerMachine && oneClick) {
      updateInfo.isAdminRightsRequired = true
    }

    await packager.info.callArtifactBuildCompleted({
      file: installerPath,
      updateInfo,
      target: this,
      packager,
      arch: this.archs.size === 1 ? this.archs.keys().next().value : null,
      safeArtifactName,
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
      log.info({reason: "custom NSIS script is used"}, "uninstaller is not signed by electron-builder")
      return script
    }

    // https://github.com/electron-userland/electron-builder/issues/2103
    // it is more safe and reliable to write uninstaller to our out dir
    const uninstallerPath = path.join(this.outDir, `__uninstaller-${this.name}-${this.packager.appInfo.sanitizedName}.exe`)
    const isWin = process.platform === "win32"
    defines.BUILD_UNINSTALLER = null
    defines.UNINSTALLER_OUT_FILE = isWin ? uninstallerPath : path.win32.join("Z:", uninstallerPath)
    await this.executeMakensis(defines, commands, sharedHeader + await this.computeFinalScript(script, false))

    // http://forums.winamp.com/showthread.php?p=3078545
    if (isMacOsCatalina()) {
      (await packager.vm.value).exec(installerPath, [])

      // Parallels VM can exit after command execution, but NSIS continue to be running
      let i = 0
      while (!(await exists(uninstallerPath)) && i++ < 100) {
        // noinspection JSUnusedLocalSymbols
        await new Promise((resolve, _reject) => setTimeout(resolve, 300))
      }
    }
    else {
      await execWine(installerPath)
    }
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
      if (options.runAfterFinish === false) {
        defines.HIDE_RUN_AFTER_FINISH = null
      }

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
        throw new InvalidConfigurationError("allowToChangeInstallationDirectory makes sense only for assisted installer (please set oneClick to false)")
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
    if (commonOptions.isCreateDesktopShortcut === DesktopShortcutCreationPolicy.NEVER) {
      defines.DO_NOT_CREATE_DESKTOP_SHORTCUT = null
    }
    if (commonOptions.isCreateDesktopShortcut === DesktopShortcutCreationPolicy.ALWAYS) {
      defines.RECREATE_DESKTOP_SHORTCUT = null
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
    const appInfo = this.packager.appInfo
    const companyName = appInfo.companyName
    if (companyName != null) {
      defines.COMPANY_NAME = companyName
    }

    // electron uses product file name as app data, define it as well to remove on uninstall
    if (defines.APP_FILENAME !== appInfo.productFilename) {
      defines.APP_PRODUCT_FILENAME = appInfo.productFilename
    }

    if (this.isWebInstaller) {
      defines.APP_PACKAGE_STORE_FILE = `${appInfo.updaterCacheDirName}\\${CURRENT_APP_PACKAGE_FILE_NAME}`
    }
    else {
      defines.APP_INSTALLER_STORE_FILE = `${appInfo.updaterCacheDirName}\\${CURRENT_APP_INSTALLER_FILE_NAME}`
    }

    if (!this.isWebInstaller && defines.APP_BUILD_DIR == null) {
      const options = this.options
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

    if (this.packager.debugLogger.isEnabled) {
      this.packager.debugLogger.add("nsis.script", script)
    }

    const nsisPath = await NSIS_PATH.value
    const command = path.join(nsisPath, process.platform === "darwin" ? "mac" : (process.platform === "win32" ? "Bin" : "linux"), process.platform === "win32" ? "makensis.exe" : "makensis")
    await spawnAndWrite(command, args, script, {
      // we use NSIS_CONFIG_CONST_DATA_PATH=no to build makensis on Linux, but in any case it doesn't use stubs as MacOS/Windows version, so, we explicitly set NSISDIR
      env: {...process.env, NSISDIR: nsisPath},
      cwd: nsisTemplatesDir,
    })
  }

  private async computeCommonInstallerScriptHeader() {
    const packager = this.packager
    const options = this.options
    const scriptGenerator = new NsisScriptGenerator()
    const langConfigurator = new LangConfigurator(options)

    scriptGenerator.include(path.join(nsisTemplatesDir, "include", "StdUtils.nsh"))

    const includeDir = path.join(nsisTemplatesDir, "include")
    scriptGenerator.addIncludeDir(includeDir)
    scriptGenerator.flags(["updated", "force-run", "keep-shortcuts", "no-desktop-shortcut", "delete-app-data", "allusers", "currentuser"])

    createAddLangsMacro(scriptGenerator, langConfigurator)

    const taskManager = new AsyncTaskManager(packager.info.cancellationToken)

    const pluginArch = this.isUnicodeEnabled ? "x86-unicode" : "x86-ansi"
    taskManager.add(async () => {
      scriptGenerator.addPluginDir(pluginArch, path.join(await nsisResourcePathPromise.value, "plugins", pluginArch))
    })

    taskManager.add(async () => {
      const userPluginDir = path.join(packager.info.buildResourcesDir, pluginArch)
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
          scriptGenerator.addIncludeDir(packager.info.buildResourcesDir)
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

    const preCompressedFileExtensions = this.getPreCompressedFileExtensions()
    if (preCompressedFileExtensions != null && preCompressedFileExtensions.length !== 0) {
      for (const [arch, dir] of this.archs.entries()) {
        await generateForPreCompressed(preCompressedFileExtensions, dir, arch, scriptGenerator)
      }
    }

    const fileAssociations = packager.fileAssociations
    if (fileAssociations.length !== 0) {

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

async function generateForPreCompressed(preCompressedFileExtensions: Array<string>, dir: string, arch: Arch, scriptGenerator: NsisScriptGenerator) {
  const resourcesDir = path.join(dir, "resources")
  const dirInfo = await statOrNull(resourcesDir)
  if (dirInfo == null || !dirInfo.isDirectory()) {
    return
  }

  const nodeModules = `${path.sep}node_modules`
  const preCompressedAssets = await walk(resourcesDir, (file, stat) => {
    if (stat.isDirectory()) {
      return !file.endsWith(nodeModules)
    }
    else {
      return preCompressedFileExtensions.some(it => file.endsWith(it))
    }
  })

  if (preCompressedAssets.length !== 0) {
    const macro = new NsisScriptGenerator()
    for (const file of preCompressedAssets) {
      macro.file(`$INSTDIR\\${path.relative(dir, file).replace(/\//g, "\\")}`, file)
    }
    scriptGenerator.macro(`customFiles_${Arch[arch]}`, macro)
  }
}

async function createPackageFileInfo(file: string): Promise<PackageFileInfo> {
  return {
    path: file,
    size: (await stat(file)).size,
    sha512: await hashFile(file),
  }
}
