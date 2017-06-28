import BluebirdPromise from "bluebird-lst"
import _debug from "debug"
import { asArray, spawn, use } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { copyDir, copyFile } from "electron-builder-util/out/fs"
import { orIfFileNotExist } from "electron-builder-util/out/promise"
import { emptyDir, readdir, readFile, writeFile } from "fs-extra-p"
import * as path from "path"
import { Arch, getArchSuffix, Target } from "../core"
import { AppXOptions } from "../options/winOptions"
import { AsyncTaskManager } from "../util/asyncTaskManager"
import { getSignVendorPath, isOldWin6 } from "../windowsCodeSign"
import { WinPackager } from "../winPackager"

const APPX_ASSETS_DIR_NAME = "appx"

const vendorAssetsForDefaultAssets: { [key: string]: string; } = {
  "StoreLogo.png": "SampleAppx.50x50.png",
  "Square150x150Logo.png": "SampleAppx.150x150.png",
  "Square44x44Logo.png": "SampleAppx.44x44.png",
  "Wide310x150Logo.png": "SampleAppx.310x150.png",
}

const DEFAULT_RESOURCE_LANG = "en-US"
const debug = _debug("electron-builder:appx")

export default class AppXTarget extends Target {
  readonly options: AppXOptions = deepAssign({}, this.packager.platformSpecificBuildOptions, this.packager.config.appx)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("appx")

    if (process.platform !== "win32" || isOldWin6()) {
      throw new Error("AppX is supported only on Windows 10 or Windows Server 2012 R2 (version number 6.3+)")
    }
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager

    const cscInfo = await this.packager.cscInfo.value
    if (cscInfo == null) {
      throw new Error("AppX package must be signed, but certificate is not set, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing\n\nYou can use `./node_modules/.bin/create-self-signed-cert -p YourName` to create self-signed certificate")
    }

    let publisher = this.options.publisher
    if (publisher == null) {
      const cscFile = cscInfo.file
      if (cscFile == null) {
        throw new Error("Please specify appx.publisher: cannot get publisher from your code signing certificate if EV cert is used")
      }

      publisher = await packager.computedPublisherSubjectOnWindowsOnly.value
      if (!publisher) {
        throw new Error("Please specify appx.publisher, cannot compute from p12 file")
      }
    }

    const preAppx = path.join(this.outDir, `pre-appx-${getArchSuffix(arch)}`)
    await emptyDir(preAppx)

    const resourceList = await packager.resourceList
    if (resourceList.includes(APPX_ASSETS_DIR_NAME)) {
      await copyDir(path.join(packager.buildResourcesDir, APPX_ASSETS_DIR_NAME), path.join(preAppx, "assets"))
    }

    const userAssets = await orIfFileNotExist(readdir(path.join(packager.buildResourcesDir, APPX_ASSETS_DIR_NAME)), [])
    const vendorPath = await getSignVendorPath()
    const taskManager = new AsyncTaskManager(packager.info.cancellationToken)
    taskManager.addTask(BluebirdPromise.map(Object.keys(vendorAssetsForDefaultAssets), defaultAsset => {
      if (!isDefaultAssetIncluded(userAssets, defaultAsset)) {
        copyFile(path.join(vendorPath, "appxAssets", vendorAssetsForDefaultAssets[defaultAsset]), path.join(preAppx, "assets", defaultAsset))
      }
    }))
    taskManager.addTask(this.writeManifest(path.join(__dirname, "..", "..", "templates", "appx"), preAppx, arch, publisher!, userAssets))
    taskManager.addTask(copyDir(appOutDir, path.join(preAppx, "app")))
    await taskManager.awaitTasks()

    const destination = path.join(this.outDir, packager.expandArtifactNamePattern(this.options, "appx", arch))
    const makeAppXArgs = ["pack", "/o", "/d", preAppx, "/p", destination]

    // we do not use process.arch to build path to tools, because even if you are on x64, ia32 appx tool must be used if you build appx for ia32
    if (isScaledAssetsProvided(userAssets)) {
      const priConfigPath = path.join(preAppx, "priconfig.xml")
      const makePriPath = path.join(vendorPath, "windows-10", Arch[arch], "makepri.exe")
      await spawn(makePriPath, ["createconfig", "/cf", priConfigPath, "/dq", "en-US", "/pv", "10.0.0", "/o"], undefined, {isDebugEnabled: debug.enabled})
      await spawn(makePriPath, ["new", "/pr", preAppx, "/cf", priConfigPath, "/of", preAppx], undefined, {isDebugEnabled: debug.enabled})

      makeAppXArgs.push("/l")
    }

    use(this.options.makeappxArgs, (it: Array<string>) => makeAppXArgs.push(...it))
    // wine supports only ia32 binary in any case makeappx crashed on wine
    await spawn(path.join(vendorPath, "windows-10", Arch[arch], "makeappx.exe"), makeAppXArgs, undefined, {isDebugEnabled: debug.enabled})
    await packager.sign(destination)

    packager.dispatchArtifactCreated(destination, this, arch, packager.computeSafeArtifactName("appx"))
  }

  private async writeManifest(templatePath: string, preAppx: string, arch: Arch, publisher: string, userAssets: Array<string>) {
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

          case "name":
            return appInfo.name

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
    await writeFile(path.join(preAppx, "appxmanifest.xml"), manifest)
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
  const defaultAssetName = defaultAsset.split(".")[0]
  return userAssets.some(it => it.includes(defaultAssetName))
}

function isScaledAssetsProvided(userAssets: Array<string>) {
  // noinspection SpellCheckingInspection
  return userAssets.some(it => it.includes(".scale-") || it.includes(".targetsize-"))
}

export function quoteString(s: string): string {
  if (!s.includes(",") && !s.includes('"')) {
    return s
  }

  return `"${s.replace(/"/g, '\\"')}"`
}
