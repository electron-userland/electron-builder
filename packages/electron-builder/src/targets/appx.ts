import BluebirdPromise from "bluebird-lst"
import { Arch, getArchSuffix, Target } from "electron-builder-core"
import { exec, spawn, use } from "electron-builder-util"
import { copyDir, copyFile } from "electron-builder-util/out/fs"
import { emptyDir, readdir, readFile, writeFile } from "fs-extra-p"
import * as path from "path"
import { AppXOptions } from "../options/winOptions"
import { getSignVendorPath, isOldWin6 } from "../windowsCodeSign"
import { WinPackager } from "../winPackager"

export default class AppXTarget extends Target {
  readonly options: AppXOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, this.packager.config.appx)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("appx")

    if (process.platform !== "win32" || isOldWin6()) {
      throw new Error("AppX is supported only on Windows 10 or Windows Server 2012 R2 (version number 6.3+)")
    }
  }

  // no flatten - use asar or npm 3 or yarn
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

      publisher = (await exec("powershell.exe", [`(Get-PfxCertificate "${cscFile}").Subject`])).trim()
      if (!publisher) {
        throw new Error("Please specify appx.publisher: Get-PfxCertificate returns empty string")
      }
    }

    const preAppx = path.join(this.outDir, `pre-appx-${getArchSuffix(arch)}`)
    await emptyDir(preAppx)

    const destination = path.join(this.outDir, packager.expandArtifactNamePattern(this.options, "appx", arch))
    const vendorPath = await getSignVendorPath()

    const templatePath = path.join(__dirname, "..", "..", "templates", "appx")
    
    const resourceList = await packager.resourceList
    if (resourceList.includes("appx_assets")) {
      await copyDir(path.join(packager.buildResourcesDir, "appx_assets"), path.join(preAppx, "assets"))
    }

    const userAssets = await readdir(path.join(packager.buildResourcesDir, "appx_assets"))
      .catch(e => {
        if (e.code === "ENOENT") {
            return []
        } else {
            throw e
        }
      })
      
    const vendorAssetsForDefaultAssets: any = {
      "StoreLogo.png": "SampleAppx.50x50.png",
      "Square150x150Logo.png": "SampleAppx.150x150.png",
      "Square44x44Logo.png": "SampleAppx.44x44.png",
      "Wide310x150Logo.png": "SampleAppx.310x150.png",
    }
    const defaultAssets = Object.keys(vendorAssetsForDefaultAssets)

    await BluebirdPromise.map(defaultAssets, defaultAsset => {
      if (!this.defaultAssetIncluded(userAssets, defaultAsset)) {
        return copyFile(path.join(vendorPath, "appxAssets", vendorAssetsForDefaultAssets[defaultAsset]), path.join(preAppx, "assets", defaultAsset))
      }
      return
    })

    this.writeManifest(templatePath, preAppx, arch, publisher, userAssets)

    await copyDir(appOutDir, path.join(preAppx, "app"))

    const makeAppXArgs = ["pack", "/o", "/d", preAppx, "/p", destination]

    if (this.scaledAssetsProvided(userAssets)) {
      const priConfigPath = path.join(preAppx, "priconfig.xml")
      const makePriCreateConfigArgs = ["createconfig", "/cf", priConfigPath, "/dq", "en-US", "/pv", "10.0.0", "/o"]
      await spawn(path.join(vendorPath, "windows-10", arch === Arch.ia32 ? "ia32" : "x64", "makepri.exe"), makePriCreateConfigArgs)
      const makrPriNewArgs = ["new", "/pr", preAppx, "/cf", priConfigPath, "/of", preAppx]
      await spawn(path.join(vendorPath, "windows-10", arch === Arch.ia32 ? "ia32" : "x64", "makepri.exe"), makrPriNewArgs)

      makeAppXArgs.push("/l")
    }

    use(this.options.makeappxArgs, (it: Array<string>) => makeAppXArgs.push(...it))
    // wine supports only ia32 binary in any case makeappx crashed on wine
    // await execWine(path.join(await getSignVendorPath(), "windows-10", process.platform === "win32" ? process.arch : "ia32", "makeappx.exe"), makeAppXArgs)
    await spawn(path.join(vendorPath, "windows-10", arch === Arch.ia32 ? "ia32" : "x64", "makeappx.exe"), makeAppXArgs)

    await packager.sign(destination)
    packager.dispatchArtifactCreated(destination, this, arch, packager.computeSafeArtifactName("appx"))
  }

  private async writeManifest(templatePath: string, preAppx: string, arch: Arch, publisher: string, userAssets: Array<string>) {
    const appInfo = this.packager.appInfo
    const manifest = (await readFile(path.join(templatePath, "appxmanifest.xml"), "utf8"))
      .replace(/\$\{([a-zA-Z0-9]+)\}/g, (match, p1): string => {
        switch (p1) {
          case "publisher":
            return publisher

          case "publisherDisplayName":
            const name = this.options.publisherDisplayName || appInfo.companyName
            if (name == null) {
              throw new Error(`Please specify "author" in the application package.json — it is required because "appx.publisherDisplayName" is not set.`)
            }
            return name

          case "version":
            return appInfo.versionInWeirdWindowsForm

          case "name":
            return appInfo.name
            
          case "identityName":
            return this.options.identityName  || appInfo.name

          case "executable":
            return `app\\${appInfo.productFilename}.exe`

          case "displayName":
            return this.options.displayName || appInfo.productName
            
          case "description":
            return appInfo.description || appInfo.productName

          case "backgroundColor":
            return this.options.backgroundColor || "#464646"

          case "logo":
            return "assets\\StoreLogo.png"

          case "square150x150Logo":
            return "assets\\Square150x150Logo.png"

          case "square44x44Logo":
            return "assets\\Square44x44Logo.png"

          case "lockScreen":
            return this.lockScreenTag(userAssets)

          case "defaultTile":
            return this.defaultTileTag(userAssets)

          case "splashScreen":
            return this.splashScreenTag(userAssets)
            
          case "arch":
            return arch === Arch.ia32 ? "x86" : "x64"

          default:
            throw new Error(`Macro ${p1} is not defined`)
        }
      })
    await writeFile(path.join(preAppx, "appxmanifest.xml"), manifest)
  }

  private lockScreenTag(userAssets: Array<string>): string {
    if (this.defaultAssetIncluded(userAssets, "BadgeLogo.png")) {
      return '<uap:LockScreen Notification="badgeAndTileText" BadgeLogo="assets\\BadgeLogo.png" />'
    } else {
      return ""
    }
  }

  private defaultTileTag(userAssets: Array<string>): string {
    const defaultTiles: Array<string> = ["<uap:DefaultTile", 'Wide310x150Logo="assets\\Wide310x150Logo.png"']

    if (this.defaultAssetIncluded(userAssets, "LargeTile.png")) {
      defaultTiles.push('Square310x310Logo="assets\\LargeTile.png"')
    }
    if (this.defaultAssetIncluded(userAssets, "SmallTile.png")) {
      defaultTiles.push('Square71x71Logo="assets\\SmallTile.png"')
    }

    defaultTiles.push("/>")

    return defaultTiles.join(" ")
  }

  private splashScreenTag(userAssets: Array<string>): string {
    if (this.defaultAssetIncluded(userAssets, "SplashScreen.png")) {
      return '<uap:SplashScreen Image="assets\\SplashScreen.png" />'
    } else {
      return ""
    }
  }

  private defaultAssetIncluded(userAssets: Array<string>, defaultAsset: string): boolean {
    const defaultAssetName = defaultAsset.split(".")[0]

    for (let i = 0; i < userAssets.length; i++) {
      if (userAssets[i].includes(defaultAssetName)) {
        return true
      }
    }

    return false
  }

  private scaledAssetsProvided(userAssets: Array<string>): boolean {
    for (let i = 0; i < userAssets.length; i++) {
      if (userAssets[i].includes(".scale-") || userAssets[i].includes(".targetsize-")) {
        return true
      }
    }

    return false
  }
}

export function quoteString(s: string): string {
  if (!s.includes(",") && !s.includes('"')) {
    return s
  }

  return `"${s.replace(/"/g, '\\"')}"`
}