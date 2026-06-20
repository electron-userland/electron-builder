import { Arch, asArray, InvalidConfigurationError, log } from "builder-util"

import path from "path"
import { AppXOptions } from "../../index.js"
import { isOldWin6 } from "../../toolsets/winCodeSign.js"
import { Target } from "../../core.js"
import { getTemplatePath } from "../../util/pathManager.js"
import { WinPackager } from "../../winPackager.js"
// Shared with the MSIX target — winAppUtil is the single source of truth for the build pipeline + manifest helpers.
import {
  buildAppxPackage,
  buildCapabilitiesXml,
  buildExtensionsXml,
  defaultTileTag,
  lockScreenTag,
  resolvePackageApplicationId,
  resolvePackageIdentityName,
  resourceLanguageTag,
  splashScreenTag,
  substituteManifestMacros,
} from "./winAppUtil.js"
import _fsExtra from "fs-extra"
const { readFile, writeFile } = _fsExtra

export default class AppXTarget extends Target {
  readonly options: AppXOptions = this.packager.getOptionsForTarget<AppXOptions>("appx")

  isAsyncSupported = false

  constructor(
    private readonly packager: WinPackager,
    readonly outDir: string
  ) {
    super("appx")

    if (process.platform !== "darwin" && (process.platform !== "win32" || isOldWin6())) {
      throw new Error("AppX is supported only on Windows 10 or Windows Server 2012 R2 (version number 6.3+)")
    }
  }

  // https://docs.microsoft.com/en-us/windows/uwp/packaging/create-app-package-with-makeappx-tool#mapping-files
  build(appOutDir: string, arch: Arch): Promise<any> {
    return buildAppxPackage(this, this.packager, this.options, appOutDir, arch, {
      kind: "appx",
      presentableName: "AppX",
      writeManifest: (manifestFile, a, publisher, userAssets) => this.writeManifest(manifestFile, a, publisher, userAssets),
    })
  }

  private async writeManifest(outFile: string, arch: Arch, publisher: string, userAssets: Array<string>) {
    const appInfo = this.packager.appInfo
    const options = this.options
    const executable = `app\\${appInfo.productFilename}.exe`
    const displayName = options.displayName || appInfo.productName
    const capabilities = this.getCapabilities()
    const extensions = await this.getExtensions(executable, displayName)
    const archSpecificMinVersion = arch === Arch.arm64 ? "10.0.16299.0" : "10.0.14316.0"

    const customManifestPath = await this.packager.getResource(this.options.customManifestPath)
    if (customManifestPath) {
      log.info({ manifestPath: log.filePath(customManifestPath) }, "custom appx manifest found")
    }
    const manifestFileContent = await readFile(customManifestPath || path.join(getTemplatePath("appx"), "appxmanifest.xml"), "utf8")
    const manifest = substituteManifestMacros(manifestFileContent, (p1): string => {
      switch (p1) {
        case "publisher":
          return publisher

        case "publisherDisplayName": {
          const name = options.publisherDisplayName || appInfo.companyName
          if (name == null) {
            throw new InvalidConfigurationError(`Please specify "author" in the application package.json — it is required because "appx.publisherDisplayName" is not set.`)
          }
          return name
        }

        case "version":
          return appInfo.getVersionInWeirdWindowsForm(options.setBuildNumber === true)

        case "applicationId":
          // Shared with MSIX: consistent "AppX" label, correct validation messages, and identical
          // numeric-prefix stripping / validation logic (see appxUtil.resolvePackageApplicationId).
          return resolvePackageApplicationId(options.applicationId, options.identityName, appInfo.name, "AppX")

        case "identityName":
          return resolvePackageIdentityName(options.identityName, appInfo.name, "AppX")

        case "executable":
          return executable

        case "displayName":
          return displayName

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
          return defaultTileTag(userAssets, options.showNameOnTiles || false)

        case "splashScreen":
          return splashScreenTag(userAssets)

        case "arch":
          return arch === Arch.ia32 ? "x86" : arch === Arch.arm64 ? "arm64" : "x64"

        case "resourceLanguages":
          return resourceLanguageTag(asArray(options.languages))

        case "capabilities":
          return capabilities

        case "extensions":
          return extensions

        case "minVersion":
          return options.minVersion || archSpecificMinVersion

        case "maxVersionTested":
          return options.maxVersionTested || options.minVersion || archSpecificMinVersion

        default:
          throw new Error(`Macro ${p1} is not defined`)
      }
    })
    await writeFile(outFile, manifest)
  }

  private getCapabilities(): string {
    return `<Capabilities>\n${buildCapabilitiesXml(this.options.capabilities)}\n</Capabilities>`
  }

  private getExtensions(executable: string, displayName: string): Promise<string> {
    // Delegate to the shared, XML-escaped helper so AppX and MSIX produce identical (and safely
    // escaped) extension XML and cannot drift. Raw interpolation here previously left protocol
    // schemes/names, file-association extensions, displayName and executable unescaped.
    return buildExtensionsXml({
      protocols: asArray(this.packager.config.protocols).concat(asArray(this.packager.platformOptions.protocols)),
      fileAssociations: asArray(this.packager.config.fileAssociations).concat(asArray(this.packager.platformOptions.fileAssociations)),
      addAutoLaunchExtension: this.options.addAutoLaunchExtension,
      customExtensionsPath: this.options.customExtensionsPath,
      appDir: this.packager.appDir,
      executable,
      displayName,
      dependencyNames: this.packager.metadata.dependencies,
    })
  }
}
