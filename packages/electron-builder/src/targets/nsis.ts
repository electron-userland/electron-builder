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
      options = Object.assign(options, (<any>this.packager.config)[targetName === "nsis-web" ? "nsisWeb" : targetName])
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
      handleProcess("close", childProcess, command, resolve, error => {
        reject(error + "\nNSIS script:\n" + script)
      })

      childProcess.stdin.end(script)
    })
  }

  private async computeFinalScript(originalScript: string, isInstaller: boolean) {
    const packager = this.packager
    let scriptHeader = `!addincludedir "${path.win32.join(__dirname, "..", "..", "templates", "nsis", "include")}"\n`
    
    const pluginArch = this.isUnicodeEnabled ? "x86-unicode" : "x86-ansi"
    scriptHeader += `!addplugindir /${pluginArch} "${path.join(await nsisResourcePathPromise, "plugins", pluginArch)}"\n`
    scriptHeader += `!addplugindir /${pluginArch} "${path.join(packager.buildResourcesDir, pluginArch)}"\n`
    
    // http://stackoverflow.com/questions/997456/nsis-license-file-based-on-language-selection
    let licensePage: Array<string> | null
    const license = await packager.getResource(this.options.license, "license.rtf", "license.txt", "eula.rtf", "eula.txt", "LICENSE.rtf", "LICENSE.txt", "EULA.rtf", "EULA.txt", "LICENSE.RTF", "LICENSE.TXT", "EULA.RTF", "EULA.TXT")
    if (license == null) {
      const licenseFiles = (await packager.resourceList)
        .filter(it => {
          const name = it.toLowerCase()
          return (name.startsWith("license_") || name.startsWith("eula_")) && (name.endsWith(".rtf") || name.endsWith(".txt"))
        })
      
      if (licenseFiles.length === 0) {
        licensePage = null
      }
      else {
        licensePage = []
        const unspecifiedLangs = new Set(bundledLanguages)

        let defaultFile: string | null = null
        const sortedFiles = licenseFiles.sort((a, b) => {
          const aW = a.includes("_en") ? 0 : 100
          const bW = b.includes("_en") ? 0 : 100
          return aW === bW ? a.localeCompare(b) : aW - bW
        })
        for (const file of sortedFiles) {
          let lang = file.match(/_([^.]+)\./)![1]
          let langWithRegion
          if (lang.includes("_")) {
            langWithRegion = lang
          }
          else {
            lang = lang.toLowerCase()
            langWithRegion = langToLangWithRegion.get(lang)
            if (langWithRegion == null) {
              langWithRegion = `${lang}_${lang.toUpperCase()}`
            }
          }
          
          unspecifiedLangs.delete(langWithRegion)
          const fullFile = path.join(packager.buildResourcesDir, file)
          if (defaultFile == null) {
            defaultFile = fullFile
          }
          licensePage.push(`LicenseLangString MUILicense ${lcid[langWithRegion] || lang} "${fullFile}"`)
        }
        
        for (const l of unspecifiedLangs) {
          licensePage.push(`LicenseLangString MUILicense ${lcid[l]} "${defaultFile}"`)
        }
        
        licensePage.push('!insertmacro MUI_PAGE_LICENSE "$(MUILicense)"')
      }
    }
    else {
      licensePage = [`!insertmacro MUI_PAGE_LICENSE "${license}"`]
    }
    
    if (licensePage != null) {
      scriptHeader += createMacro("licensePage", licensePage)
    }

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

function createMacro(name: string, lines: Array<string>) {
  return `\n!macro ${name}\n  ${lines.join("\n  ")}\n!macroend\n`
}

const lcid: any = {
	"af_ZA": 1078,
	"am_ET": 1118,
	"ar_AE": 14337,
	"ar_BH": 15361,
	"ar_DZ": 5121,
	"ar_EG": 3073,
	"ar_IQ": 2049,
	"ar_JO": 11265,
	"ar_KW": 13313,
	"ar_LB": 12289,
	"ar_LY": 4097,
	"ar_MA": 6145,
	"ar_OM": 8193,
	"ar_QA": 16385,
	"ar_SA": 1025,
	"ar_SY": 10241,
	"ar_TN": 7169,
	"ar_YE": 9217,
	"arn_CL": 1146,
	"as_IN": 1101,
	"az_AZ": 2092,
	"ba_RU": 1133,
	"be_BY": 1059,
	"bg_BG": 1026,
	"bn_IN": 1093,
	"bo_BT": 2129,
	"bo_CN": 1105,
	"br_FR": 1150,
	"bs_BA": 8218,
	"ca_ES": 1027,
	"co_FR": 1155,
	"cs_CZ": 1029,
	"cy_GB": 1106,
	"da_DK": 1030,
	"de_AT": 3079,
	"de_CH": 2055,
	"de_DE": 1031,
	"de_LI": 5127,
	"de_LU": 4103,
	"div_MV": 1125,
	"dsb_DE": 2094,
	"el_GR": 1032,
	"en_AU": 3081,
	"en_BZ": 10249,
	"en_CA": 4105,
	"en_CB": 9225,
	"en_GB": 2057,
	"en_IE": 6153,
	"en_IN": 18441,
	"en_JA": 8201,
	"en_MY": 17417,
	"en_NZ": 5129,
	"en_PH": 13321,
	"en_TT": 11273,
	"en_US": 1033,
	"en_ZA": 7177,
	"en_ZW": 12297,
	"es_AR": 11274,
	"es_BO": 16394,
	"es_CL": 13322,
	"es_CO": 9226,
	"es_CR": 5130,
	"es_DO": 7178,
	"es_EC": 12298,
	"es_ES": 3082,
	"es_GT": 4106,
	"es_HN": 18442,
	"es_MX": 2058,
	"es_NI": 19466,
	"es_PA": 6154,
	"es_PE": 10250,
	"es_PR": 20490,
	"es_PY": 15370,
	"es_SV": 17418,
	"es_UR": 14346,
	"es_US": 21514,
	"es_VE": 8202,
	"et_EE": 1061,
	"eu_ES": 1069,
	"fa_IR": 1065,
	"fi_FI": 1035,
	"fil_PH": 1124,
	"fo_FO": 1080,
	"fr_BE": 2060,
	"fr_CA": 3084,
	"fr_CH": 4108,
	"fr_FR": 1036,
	"fr_LU": 5132,
	"fr_MC": 6156,
	"fy_NL": 1122,
	"ga_IE": 2108,
	"gbz_AF": 1164,
	"gl_ES": 1110,
	"gsw_FR": 1156,
	"gu_IN": 1095,
	"ha_NG": 1128,
	"he_IL": 1037,
	"hi_IN": 1081,
	"hr_BA": 4122,
	"hr_HR": 1050,
	"hu_HU": 1038,
	"hy_AM": 1067,
	"id_ID": 1057,
	"ii_CN": 1144,
	"is_IS": 1039,
	"it_CH": 2064,
	"it_IT": 1040,
	"iu_CA": 2141,
	"ja_JP": 1041,
	"ka_GE": 1079,
	"kh_KH": 1107,
	"kk_KZ": 1087,
	"kl_GL": 1135,
	"kn_IN": 1099,
	"ko_KR": 1042,
	"kok_IN": 1111,
	"ky_KG": 1088,
	"lb_LU": 1134,
	"lo_LA": 1108,
	"lt_LT": 1063,
	"lv_LV": 1062,
	"mi_NZ": 1153,
	"mk_MK": 1071,
	"ml_IN": 1100,
	"mn_CN": 2128,
	"mn_MN": 1104,
	"moh_CA": 1148,
	"mr_IN": 1102,
	"ms_BN": 2110,
	"ms_MY": 1086,
	"mt_MT": 1082,
	"my_MM": 1109,
	"nb_NO": 1044,
	"ne_NP": 1121,
	"nl_BE": 2067,
	"nl_NL": 1043,
	"nn_NO": 2068,
	"ns_ZA": 1132,
	"oc_FR": 1154,
	"or_IN": 1096,
	"pa_IN": 1094,
	"pl_PL": 1045,
	"ps_AF": 1123,
	"pt_BR": 1046,
	"pt_PT": 2070,
	"qut_GT": 1158,
	"quz_BO": 1131,
	"quz_EC": 2155,
	"quz_PE": 3179,
	"rm_CH": 1047,
	"ro_RO": 1048,
	"ru_RU": 1049,
	"rw_RW": 1159,
	"sa_IN": 1103,
	"sah_RU": 1157,
	"se_FI": 3131,
	"se_NO": 1083,
	"se_SE": 2107,
	"si_LK": 1115,
	"sk_SK": 1051,
	"sl_SI": 1060,
	"sma_NO": 6203,
	"sma_SE": 7227,
	"smj_NO": 4155,
	"smj_SE": 5179,
	"smn_FI": 9275,
	"sms_FI": 8251,
	"sq_AL": 1052,
	"sr_BA": 7194,
	"sr_SP": 3098,
	"sv_FI": 2077,
	"sv_SE": 1053,
	"sw_KE": 1089,
	"syr_SY": 1114,
	"ta_IN": 1097,
	"te_IN": 1098,
	"tg_TJ": 1064,
	"th_TH": 1054,
	"tk_TM": 1090,
	"tmz_DZ": 2143,
	"tn_ZA": 1074,
	"tr_TR": 1055,
	"tt_RU": 1092,
	"ug_CN": 1152,
	"uk_UA": 1058,
	"ur_IN": 2080,
	"ur_PK": 1056,
	"uz_UZ": 2115,
	"vi_VN": 1066,
	"wen_DE": 1070,
	"wo_SN": 1160,
	"xh_ZA": 1076,
	"yo_NG": 1130,
	"zh_CHS": 4,
	"zh_CHT": 31748,
	"zh_CN": 2052,
	"zh_HK": 3076,
	"zh_MO": 5124,
	"zh_SG": 4100,
	"zh_TW": 1028,
	"zu_ZA": 1077
}

// "el_GR" "lv_LV" "ko_KR" "tr_TR"
const bundledLanguages = ["en_US", "de_DE", "fr_FR", "es_ES", "zh_CN", "zh_TW", "ja_JP", "it_IT", "nl_NL", "ru_RU", "pl_PL", "uk_UA", "cs_CZ", "sv_SE", "nb_NO", "da_DK", "pt_PT"]
const langToLangWithRegion = new Map<string, string>()
for (const id of bundledLanguages) {
  langToLangWithRegion.set(id.substring(0, id.indexOf("_")), id)
}