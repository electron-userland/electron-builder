import { WinPackager } from "../winPackager"
import { Arch } from "../metadata"
import { exec, debug, doSpawn, handleProcess, use, asArray } from "../util/util"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { getBinFromBintray } from "../util/binDownload"
import { v5 as uuid5 } from "uuid-1345"
import { normalizeExt, getPublishConfigs, getResolvedPublishConfig, ArtifactCreated } from "../platformPackager"
import { archive } from "./archive"
import { subTask, log, warn } from "../util/log"
import { unlink, readFile, writeFile, createReadStream } from "fs-extra-p"
import { NsisOptions } from "../options/winOptions"
import { PublishConfiguration, GenericServerOptions, UpdateInfo } from "../options/publishOptions"
import { safeDump } from "js-yaml"
import { createHash } from "crypto"
import { Target } from "./targetFactory"

const NSIS_VERSION = "3.0.4"
//noinspection SpellCheckingInspection
const NSIS_SHA2 = "c29883cb9a04733489590420b910ea7a91ba0f9b776fe4c647d9801f23175225"

//noinspection SpellCheckingInspection
const ELECTRON_BUILDER_NS_UUID = "50e065bc-3134-11e6-9bab-38c9862bdaf3"

const nsisPathPromise = getBinFromBintray("nsis", NSIS_VERSION, NSIS_SHA2)

export default class NsisTarget extends Target {
  private readonly options: NsisOptions = this.packager.config.nsis || Object.create(null)

  private archs: Map<Arch, Promise<string>> = new Map()

  private readonly nsisTemplatesDir = path.join(__dirname, "..", "..", "templates", "nsis")

  private readonly publishConfigs = this.computePublishConfigs()

  constructor(private packager: WinPackager, private outDir: string) {
    super("nsis")

    const deps = packager.info.metadata.dependencies
    if (deps != null && deps["electron-squirrel-startup"] != null) {
      warn('"electron-squirrel-startup" dependency is not required for NSIS')
    }
  }

  private computePublishConfigs(): Promise<Array<PublishConfiguration> | null> {
    const publishConfigs = getPublishConfigs(this.packager, this.options)
    if (publishConfigs != null && publishConfigs.length > 0) {
      return BluebirdPromise.map(publishConfigs, it => getResolvedPublishConfig(this.packager.info, it, true))
    }
    else {
      return BluebirdPromise.resolve(null)
    }
  }

  build(appOutDir: string, arch: Arch) {
    this.archs.set(arch, this.doBuild(appOutDir, arch))
    return BluebirdPromise.resolve(null)
  }

  private async doBuild(appOutDir: string, arch: Arch) {
    log(`Packaging NSIS installer for arch ${Arch[arch]}`)

    const publishConfigs = await this.publishConfigs
    if (publishConfigs != null) {
      await writeFile(path.join(appOutDir, "resources", "app-update.yml"), safeDump(publishConfigs[0]))
    }

    const packager = this.packager
    const archiveFile = path.join(this.outDir, `${packager.appInfo.name}-${packager.appInfo.version}-${Arch[arch]}.nsis.7z`)
    return await archive(packager.config.compression, "7z", archiveFile, appOutDir, true)
  }

  async finishBuild(): Promise<any> {
    log("Building NSIS installer")
    try {
      await this.buildInstaller()
    }
    finally {
      await BluebirdPromise.map(this.archs.values(), it => unlink(it))
    }
  }

  private async buildInstaller(): Promise<any> {
    const packager = this.packager
    const appInfo = packager.appInfo
    const version = appInfo.version
    const installerFilename = `${appInfo.productFilename} Setup ${version}.exe`
    const iconPath = await packager.getResource(this.options.installerIcon, "installerIcon.ico") || await packager.getIconPath()

    const installerPath = path.join(this.outDir, installerFilename)
    const guid = this.options.guid || await BluebirdPromise.promisify(uuid5)({namespace: ELECTRON_BUILDER_NS_UUID, name: appInfo.id})
    const defines: any = {
      APP_ID: appInfo.id,
      APP_GUID: guid,
      PRODUCT_NAME: appInfo.productName,
      PRODUCT_FILENAME: appInfo.productFilename,
      APP_FILENAME: appInfo.name,
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

    for (const [arch, file] of this.archs) {
      defines[arch === Arch.x64 ? "APP_64" : "APP_32"] = await file
    }

    const oneClick = this.options.oneClick !== false

    const installerHeader = oneClick ? null : await packager.getResource(this.options.installerHeader, "installerHeader.bmp")
    if (installerHeader != null) {
      defines.MUI_HEADERIMAGE = null
      defines.MUI_HEADERIMAGE_RIGHT = null
      defines.MUI_HEADERIMAGE_BITMAP = installerHeader
    }

    const installerHeaderIcon = oneClick ? await packager.getResource(this.options.installerHeaderIcon, "installerHeaderIcon.ico") : null
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
    const localeId = this.options.language || "1033"
    const versionKey = [
      `/LANG=${localeId} ProductName "${appInfo.productName}"`,
      `/LANG=${localeId} ProductVersion "${appInfo.version}"`,
      `/LANG=${localeId} CompanyName "${appInfo.companyName}"`,
      `/LANG=${localeId} LegalCopyright "${appInfo.copyright}"`,
      `/LANG=${localeId} FileDescription "${appInfo.description}"`,
      `/LANG=${localeId} FileVersion "${appInfo.buildVersion}"`,
    ]
    use(packager.platformSpecificBuildOptions.legalTrademarks, it => versionKey.push(`/LANG=${localeId} LegalTrademarks "${it}"`))

    const commands: any = {
      OutFile: `"${installerPath}"`,
      VIProductVersion: appInfo.versionInWeirdWindowsForm,
      VIAddVersionKey: versionKey,
      Unicode: true,
    }

    if (packager.config.compression === "store") {
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

    if (packager.options.effectiveOptionComputed != null && await packager.options.effectiveOptionComputed([defines, commands])) {
      return
    }

    const licenseFile = await packager.getResource(this.options.license, "license.rtf", "license.txt")
    if (licenseFile != null) {
      defines.LICENSE_FILE = licenseFile
    }

    const customScriptPath = await packager.getResource(this.options.script, "installer.nsi")
    const script = await readFile(customScriptPath || path.join(this.nsisTemplatesDir, "installer.nsi"), "utf8")

    if (customScriptPath == null) {
      const uninstallerPath = await packager.getTempFile("uninstaller.exe")
      const isWin = process.platform === "win32"
      defines.BUILD_UNINSTALLER = null
      defines.UNINSTALLER_OUT_FILE = isWin ? uninstallerPath : path.win32.join("Z:", uninstallerPath)
      await subTask(`Executing makensis — uninstaller`, this.executeMakensis(defines, commands, false, script))
      await exec(isWin ? installerPath : "wine", isWin ? [] : [installerPath])
      await packager.sign(uninstallerPath)

      delete defines.BUILD_UNINSTALLER
      // platform-specific path, not wine
      defines.UNINSTALLER_OUT_FILE = uninstallerPath
    }
    else {
      log("Custom NSIS script is used - uninstaller is not signed by electron-builder")
    }

    await subTask(`Executing makensis — installer`, this.executeMakensis(defines, commands, true, script))
    await packager.sign(installerPath)

    const publishConfigs = await this.publishConfigs
    const githubArtifactName = `${appInfo.name}-Setup-${version}.exe`
    if (publishConfigs != null) {
      let sha2: string | null = null
      for (const publishConfig of publishConfigs) {
        if (publishConfig.provider === "generic" || publishConfig.provider === "github") {
          if (sha2 == null) {
            sha2 = await sha256(installerPath)
          }

          const channel = (<GenericServerOptions>publishConfig).channel || "latest"
          if (publishConfig.provider === "generic") {
            await writeFile(path.join(this.outDir, `${channel}.yml`), safeDump(<UpdateInfo>{
              version: version,
              path: installerFilename,
              sha2: sha2,
            }))
          }
          else {
            packager.info.eventEmitter.emit("artifactCreated", <ArtifactCreated>{
              data: new Buffer(safeDump(<UpdateInfo>{
                version: version,
                path: githubArtifactName,
                sha2: sha2,
              })),
              artifactName: `${channel}.yml`,
              packager: packager,
              publishConfig: publishConfig,
            })
          }
        }
      }
    }

    packager.dispatchArtifactCreated(installerPath, githubArtifactName)
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

    const fileAssociations = packager.getFileAssociations()
    if (fileAssociations.length !== 0) {
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
            registerFileAssociationsScript += `  !insertmacro APP_ASSOCIATE "${ext}" "${item.name}" "${item.description || ""}" ${icon} ${commandText} ${command}\n`
          }
        }
        script = `!macro registerFileAssociations\n${registerFileAssociationsScript}!macroend\n${script}`
      }
      else {
        let unregisterFileAssociationsScript = ""
        for (const item of fileAssociations) {
          for (const ext of asArray(item.ext)) {
            unregisterFileAssociationsScript += `  !insertmacro APP_UNASSOCIATE "${normalizeExt(ext)}" "${item.name}"\n`
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

function sha256(file: string) {
  return new BluebirdPromise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    hash
      .on("error", reject)
      .setEncoding("hex")

    createReadStream(file)
      .on("error", reject)
      .on("end", () => {
        hash.end()
        resolve(<string>hash.read())
      })
      .pipe(hash, {end: false})
  })
}