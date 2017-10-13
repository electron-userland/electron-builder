import BluebirdPromise from "bluebird-lst"
import { Arch, asArray, log, debug } from "builder-util"
import { walk, copyOrLinkFile } from "builder-util/out/fs"
import { emptyDir, readdir, readFile, remove, writeFile } from "fs-extra-p"
import * as path from "path"
import { deepAssign } from "read-config-file/out/deepAssign"
import { Target } from "../core"
import { AppXOptions } from "../options/winOptions"
import { getTemplatePath } from "../util/pathManager"
import { getSignVendorPath, isOldWin6 } from "../windowsCodeSign"
import { WinPackager } from "../winPackager"
import { VmManager } from "../parallels"

const APPX_ASSETS_DIR_NAME = "appx"

const vendorAssetsForDefaultAssets: { [key: string]: string; } = {
  "StoreLogo.png": "SampleAppx.50x50.png",
  "Square150x150Logo.png": "SampleAppx.150x150.png",
  "Square44x44Logo.png": "SampleAppx.44x44.png",
  "Wide310x150Logo.png": "SampleAppx.310x150.png",
}

const DEFAULT_RESOURCE_LANG = "en-US"

export default class AppXTarget extends Target {
  readonly options: AppXOptions = deepAssign({}, this.packager.platformSpecificBuildOptions, this.packager.config.appx)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("appx")

    if (process.platform !== "darwin" && (process.platform !== "win32" || isOldWin6())) {
      throw new Error("AppX is supported only on Windows 10 or Windows Server 2012 R2 (version number 6.3+)")
    }
  }

  // https://docs.microsoft.com/en-us/windows/uwp/packaging/create-app-package-with-makeappx-tool#mapping-files
  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const vendorPath = await getSignVendorPath()
    const vm = await packager.vm.value

    const tempDir = path.join(this.outDir, `__appx-temp-${Arch[arch]}`)
    await emptyDir(tempDir)

    function getTempFile(name: string) {
      return path.join(tempDir, name)
    }

    const mappingFile = getTempFile("mapping.txt")
    const artifactName = packager.expandArtifactNamePattern(this.options, "appx", arch)
    const artifactPath = path.join(this.outDir, artifactName)
    const makeAppXArgs = ["pack", "/o" /* overwrite the output file if it exists */,
      "/f", vm.toVmFile(mappingFile),
      "/p", vm.toVmFile(artifactPath),
    ]
    if (packager.compression === "store") {
      makeAppXArgs.push("/nc")
    }

    const mappingList: Array<Array<string>> = []
    mappingList.push(await BluebirdPromise.map(walk(appOutDir), file => {
      let appxPath = file.substring(appOutDir.length + 1)
      if (path.sep !== "\\") {
        appxPath = appxPath.replace(/\//g, "\\")
      }
      return `"${vm.toVmFile(file)}" "app\\${appxPath}"`
    }))

    const userAssetDir = await this.packager.getResource(undefined, APPX_ASSETS_DIR_NAME)
    const assetInfo = await AppXTarget.computeUserAssets(vm, vendorPath, userAssetDir)
    const userAssets = assetInfo.userAssets

    const manifestFile = getTempFile("AppxManifest.xml")
    await this.writeManifest(getTemplatePath("appx"), manifestFile, arch, await this.computePublisherName(), userAssets)
    mappingList.push(assetInfo.mappings)
    mappingList.push([`"${vm.toVmFile(manifestFile)}" "AppxManifest.xml"`])

    if (isScaledAssetsProvided(userAssets)) {
      const outFile = vm.toVmFile(getTempFile("resources.pri"))
      const makePriPath = vm.toVmFile(path.join(vendorPath, "windows-10", Arch[arch], "makepri.exe"))

      const assetRoot = path.join(tempDir, "appx/assets")
      await emptyDir(assetRoot)
      await BluebirdPromise.map(assetInfo.allAssets, it => copyOrLinkFile(it, path.join(assetRoot, path.basename(it))))

      await vm.exec(makePriPath, ["new",
        "/Overwrite",
        "/Manifest", vm.toVmFile(manifestFile),
        "/ProjectRoot", vm.toVmFile(path.dirname(assetRoot)),
        "/ConfigXml", vm.toVmFile(path.join(getTemplatePath("appx"), "priconfig.xml")),
        "/OutputFile", outFile,
      ])

      // in addition to resources.pri, resources.scale-140.pri and other such files will be generated
      for (const resourceFile of (await readdir(tempDir)).filter(it => it.startsWith("resources.")).sort()) {
        mappingList.push([`"${vm.toVmFile(path.join(tempDir, resourceFile))}" "${resourceFile}"`])
      }
      makeAppXArgs.push("/l")
    }

    let mapping = "[Files]"
    for (const list of mappingList) {
      mapping += "\r\n" + list.join("\r\n")
    }
    await writeFile(mappingFile, mapping)
    packager.debugLogger.add("appx.mapping", mapping)

    if (this.options.makeappxArgs != null) {
      makeAppXArgs.push(...this.options.makeappxArgs)
    }
    await vm.exec(vm.toVmFile(path.join(vendorPath, "windows-10", Arch[arch], "makeappx.exe")), makeAppXArgs)
    await packager.sign(artifactPath)

    if (!debug.enabled) {
      await remove(tempDir)
    }

    packager.info.dispatchArtifactCreated({
      file: artifactPath,
      packager,
      arch,
      safeArtifactName: packager.computeSafeArtifactName(artifactName, "appx"),
      target: this,
      isWriteUpdateInfo: this.options.electronUpdaterAware,
    })
  }

  private static async computeUserAssets(vm: VmManager, vendorPath: string, userAssetDir: string | null) {
    const mappings: Array<string> = []
    let userAssets: Array<string>
    const allAssets: Array<string> = []
    if (userAssetDir == null) {
      userAssets = []
    }
    else {
      userAssets = (await readdir(userAssetDir)).filter(it => !it.startsWith(".") && !it.endsWith(".db") && it.includes("."))
      for (const name of userAssets) {
        mappings.push(`"${vm.toVmFile(userAssetDir)}${vm.pathSep}${name}" "assets\\${name}"`)
        allAssets.push(path.join(userAssetDir, name))
      }
    }

    for (const defaultAsset of Object.keys(vendorAssetsForDefaultAssets)) {
      if (userAssets.length === 0 || !isDefaultAssetIncluded(userAssets, defaultAsset)) {
        const file = path.join(vendorPath, "appxAssets", vendorAssetsForDefaultAssets[defaultAsset])
        mappings.push(`"${vm.toVmFile(file)}" "assets\\${defaultAsset}"`)
        allAssets.push(file)
      }
    }

    // we do not use process.arch to build path to tools, because even if you are on x64, ia32 appx tool must be used if you build appx for ia32
    return {userAssets, mappings, allAssets}
  }

  // https://github.com/electron-userland/electron-builder/issues/2108#issuecomment-333200711
  private async computePublisherName() {
    if (await this.packager.cscInfo.value == null) {
      log("AppX is not signed (Windows Store only build)")
      return this.options.publisher || "CN=ms"
    }

    const publisher = await this.packager.computedPublisherSubjectOnWindowsOnly.value
    if (!publisher) {
      throw new Error("Internal error: cannot compute subject using certificate info")
    }
    return publisher
  }

  private async writeManifest(templatePath: string, outFile: string, arch: Arch, publisher: string, userAssets: Array<string>) {
    const appInfo = this.packager.appInfo
    const options = this.options
    const manifest = (await readFile(path.join(templatePath, "appxmanifest.xml"), "utf8"))
      .replace(/\$\{([a-zA-Z0-9]+)\}/g, (match, p1): string => {
        switch (p1) {
          case "publisher":
            return publisher

          case "publisherDisplayName":
            const name = options.publisherDisplayName || appInfo.companyName
            if (name == null) {
              throw new Error(`Please specify "author" in the application package.json — it is required because "appx.publisherDisplayName" is not set.`)
            }
            return name

          case "version":
            return appInfo.versionInWeirdWindowsForm

          case "applicationId":
            const result = options.applicationId || options.identityName || appInfo.name
            if (!isNaN(parseInt(result[0], 10))) {
              let message = `AppX Application.Id can’t start with numbers: "${result}"`
              if (options.applicationId == null) {
                message += `\nPlease set appx.applicationId (or correct appx.identityName or name)`
              }
              throw new Error(message)
            }
            return result

          case "identityName":
            return options.identityName  || appInfo.name

          case "executable":
            return `app\\${appInfo.productFilename}.exe`

          case "displayName":
            return options.displayName || appInfo.productName

          case "description":
            return appInfo.description || appInfo.productName

          case "backgroundColor":
            return options.backgroundColor || "#464646"

          case "logo":
            return "assets\\StoreLogo.png"

          case "square150x150Logo":
            return "assets\\Square150x150Logo.png"

          case "square44x44Logo":
            return "assets\\Square44x44Logo.png"

          case "lockScreen":
            return lockScreenTag(userAssets)

          case "defaultTile":
            return defaultTileTag(userAssets)

          case "splashScreen":
            return splashScreenTag(userAssets)

          case "arch":
            return arch === Arch.ia32 ? "x86" : "x64"

          case "resourceLanguages":
            return resourceLanguageTag(asArray(options.languages))

          default:
            throw new Error(`Macro ${p1} is not defined`)
        }
      })
    await writeFile(outFile, manifest)
  }
}

// get the resource - language tag, see https://docs.microsoft.com/en-us/windows/uwp/globalizing/manage-language-and-region#specify-the-supported-languages-in-the-apps-manifest
function resourceLanguageTag(userLanguages: Array<string> | null | undefined): string {
  if (userLanguages == null || userLanguages.length === 0) {
    userLanguages = [DEFAULT_RESOURCE_LANG]
  }
  return userLanguages.map(it => `<Resource Language="${it.replace(/_/g, "-")}" />`).join("\n")
}

function lockScreenTag(userAssets: Array<string>): string {
  if (isDefaultAssetIncluded(userAssets, "BadgeLogo.png")) {
    return '<uap:LockScreen Notification="badgeAndTileText" BadgeLogo="assets\\BadgeLogo.png" />'
  }
  else {
    return ""
  }
}

function defaultTileTag(userAssets: Array<string>): string {
  const defaultTiles: Array<string> = ["<uap:DefaultTile", 'Wide310x150Logo="assets\\Wide310x150Logo.png"']

  if (isDefaultAssetIncluded(userAssets, "LargeTile.png")) {
    defaultTiles.push('Square310x310Logo="assets\\LargeTile.png"')
  }
  if (isDefaultAssetIncluded(userAssets, "SmallTile.png")) {
    defaultTiles.push('Square71x71Logo="assets\\SmallTile.png"')
  }

  defaultTiles.push("/>")
  return defaultTiles.join(" ")
}

function splashScreenTag(userAssets: Array<string>): string {
  if (isDefaultAssetIncluded(userAssets, "SplashScreen.png")) {
    return '<uap:SplashScreen Image="assets\\SplashScreen.png" />'
  }
  else {
    return ""
  }
}

function isDefaultAssetIncluded(userAssets: Array<string>, defaultAsset: string) {
  const defaultAssetName = defaultAsset.substring(0, defaultAsset.indexOf("."))
  return userAssets.some(it => it.includes(defaultAssetName))
}

function isScaledAssetsProvided(userAssets: Array<string>) {
  return userAssets.some(it => it.includes(".scale-") || it.includes(".targetsize-"))
}

export function quoteString(s: string): string {
  if (!s.includes(",") && !s.includes('"')) {
    return s
  }

  return `"${s.replace(/"/g, '\\"')}"`
}
