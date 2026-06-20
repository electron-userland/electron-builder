import { Arch, asArray, copyOrLinkFile, ensureNotBusy, exec, InvalidConfigurationError, log } from "builder-util"
import { getPath7za } from "../toolsets/7zip.js"
import _fsExtra from "fs-extra"
const { mkdirs, readFile, remove, writeFile } = _fsExtra
import * as path from "path"
import { MsixOptions } from "../options/MsixOptions.js"
import { isLegacyWinCodeSign, isOldWin6 } from "../toolsets/winCodeSign.js"
import { Target } from "../core.js"
import { getTemplatePath } from "../util/pathManager.js"
import type { VmManager } from "../vm/vm.js"
import { WinPackager } from "../winPackager.js"
import {
  buildAppxPackage,
  buildCapabilitiesXml,
  buildExtensionsXml,
  buildWindowsServicesXml,
  defaultTileTag,
  lockScreenTag,
  resolvePackageApplicationId,
  resolvePackageIdentityName,
  resourceLanguageTag,
  splashScreenTag,
  substituteManifestMacros,
} from "./winAppUtil.js"

export default class MsixTarget extends Target {
  readonly options: MsixOptions = this.packager.getOptionsForTarget<MsixOptions>("msix")

  isAsyncSupported = false

  private readonly builtPackages = new Map<Arch, string>()
  private vendorPathKit: string | null = null
  private vm: VmManager | null = null

  constructor(
    private readonly packager: WinPackager,
    readonly outDir: string
  ) {
    super("msix")

    if (process.platform !== "darwin" && (process.platform !== "win32" || isOldWin6())) {
      throw new Error("MSIX is supported on Windows 10 or Windows Server 2012 R2 (version number 6.3+) and on macOS via Parallels Desktop")
    }
  }

  build(appOutDir: string, arch: Arch): Promise<any> {
    return buildAppxPackage(this, this.packager, this.options, appOutDir, arch, {
      kind: "msix",
      presentableName: "MSIX",
      preflight: () => {
        // unset / null / "latest" and any modern version pin resolve to a modern Windows Kits bundle (with
        // the MSIX SDK); only the explicit legacy "0.0.0" (winCodeSign-2.6.0) pin lacks it. A custom { url }
        // toolset is the user's responsibility.
        if (isLegacyWinCodeSign(this.packager.config.toolsets?.winCodeSign)) {
          throw new InvalidConfigurationError(
            'MSIX packaging requires a modern Windows Kits toolset. The legacy "0.0.0" (winCodeSign-2.6.0) bundle does not include the Windows SDK version required for MSIX. ' +
              'Use the default toolset or pin "toolsets.winCodeSign" to a modern version (e.g. "1.0.0", "1.1.0", or "1.3.0").'
          )
        }
      },
      writeManifest: (manifestFile, a, publisher, userAssets) => this.writeManifest(manifestFile, a, publisher, userAssets),
      // Record per-arch context so finishBuild can assemble the .msixbundle / .msixupload.
      onBuilt: ({ arch: builtArch, artifactPath, vendorPathKit, vm }) => {
        this.builtPackages.set(builtArch, artifactPath)
        this.vendorPathKit = vendorPathKit
        this.vm = vm
      },
    })
  }

  async finishBuild(): Promise<void> {
    await super.finishBuild()

    const packagePaths = Array.from(this.builtPackages.values())
    if (packagePaths.length === 0) {
      return
    }

    let bundlePath: string | undefined
    if (this.options.createMsixbundle !== false && packagePaths.length > 1) {
      bundlePath = await this.createMsixBundle(packagePaths)
    }

    if (this.options.createMsixupload === true) {
      await this.createMsixUpload(bundlePath ?? packagePaths[0])
    }
  }

  private async createMsixBundle(packagePaths: ReadonlyArray<string>): Promise<string> {
    const packager = this.packager
    const vm = this.vm!
    const kitPath = this.vendorPathKit!

    const bundleName = packager.expandArtifactBeautyNamePattern(this.options, "msixbundle", Arch.x64)
    const bundlePath = path.join(this.outDir, bundleName)

    await packager.emitArtifactBuildStarted({
      targetPresentableName: "MSIX Bundle",
      file: bundlePath,
      arch: null,
    })

    const stagingDir = path.join(this.outDir, ".msixbundle-staging")
    await mkdirs(stagingDir)
    try {
      await Promise.all(packagePaths.map(p => copyOrLinkFile(p, path.join(stagingDir, path.basename(p)))))
      const makeAppxExe = path.join(kitPath, "makeappx.exe")
      await ensureNotBusy(makeAppxExe)
      await vm.exec(vm.toVmFile(makeAppxExe), ["bundle", "/o", "/d", vm.toVmFile(stagingDir), "/p", vm.toVmFile(bundlePath)])
    } finally {
      await remove(stagingDir)
    }

    await packager.signIf(bundlePath)

    await packager.emitArtifactBuildCompleted({
      file: bundlePath,
      packager,
      arch: null,
      safeArtifactName: packager.computeSafeArtifactName(bundleName, "msixbundle"),
      target: this,
      isWriteUpdateInfo: false,
    })

    return bundlePath
  }

  private async createMsixUpload(sourcePath: string): Promise<void> {
    const packager = this.packager
    const uploadName = packager.expandArtifactBeautyNamePattern(this.options, "msixupload", Arch.x64)
    const uploadPath = path.join(this.outDir, uploadName)

    await packager.emitArtifactBuildStarted({
      targetPresentableName: "MSIX Upload",
      file: uploadPath,
      arch: null,
    })

    const sevenZa = await getPath7za()
    await exec(sevenZa, ["a", "-tzip", uploadPath, sourcePath])

    await packager.emitArtifactBuildCompleted({
      file: uploadPath,
      packager,
      arch: null,
      safeArtifactName: packager.computeSafeArtifactName(uploadName, "msixupload"),
      target: this,
      isWriteUpdateInfo: false,
    })
  }

  private async writeManifest(outFile: string, arch: Arch, publisher: string, userAssets: Array<string>) {
    const appInfo = this.packager.appInfo
    const options = this.options
    const executable = `app\\${appInfo.productFilename}.exe`
    const displayName = options.displayName || appInfo.productName
    const capabilities = this.getCapabilities()
    const extensions = await this.getExtensions(executable, displayName)
    const defaultMinVersion = "10.0.17763.0"

    const customManifestPath = await this.packager.getResource(options.customManifestPath)
    if (customManifestPath) {
      log.info({ manifestPath: log.filePath(customManifestPath) }, "custom msix manifest found")
    }
    const manifestFileContent = await readFile(customManifestPath || path.join(getTemplatePath("msix"), "appxmanifest.xml"), "utf8")
    const manifest = substituteManifestMacros(manifestFileContent, (p1): string => {
      switch (p1) {
        case "publisher":
          return publisher

        case "publisherDisplayName": {
          const name = options.publisherDisplayName || appInfo.companyName
          if (name == null) {
            throw new InvalidConfigurationError(`Please specify "author" in the application package.json — it is required because "msix.publisherDisplayName" is not set.`)
          }
          return name
        }

        case "version":
          return appInfo.getVersionInWeirdWindowsForm(options.setBuildNumber === true)

        case "applicationId":
          return resolvePackageApplicationId(options.applicationId, options.identityName, appInfo.name, "MSIX")

        case "identityName":
          return resolvePackageIdentityName(options.identityName, appInfo.name, "MSIX")

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
          return options.minVersion || defaultMinVersion

        case "maxVersionTested":
          return options.maxVersionTested || options.minVersion || defaultMinVersion

        case "packageIntegrity":
          // uap10:PackageIntegrity belongs inside <Properties>, not <Capabilities>. It takes no
          // attributes; a child <uap10:Content Enforcement="on" /> is required to actually enable
          // runtime integrity checks (a bare/childless element is a no-op).
          // https://learn.microsoft.com/uwp/schemas/appxpackage/uapmanifestschema/element-uap10-packageintegrity
          return options.enforcePackageIntegrity === true ? '<uap10:PackageIntegrity><uap10:Content Enforcement="on" /></uap10:PackageIntegrity>' : ""

        default:
          throw new Error(`Macro ${p1} is not defined`)
      }
    })
    await writeFile(outFile, manifest)
  }

  private getCapabilities(): string {
    const inner = buildCapabilitiesXml(this.options.capabilities)
    return `<Capabilities>\n${inner}\n</Capabilities>`
  }

  private async getExtensions(executable: string, displayName: string): Promise<string> {
    const packager = this.packager
    const options = this.options

    const baseExtensions = await buildExtensionsXml({
      protocols: asArray(packager.config.protocols).concat(asArray(packager.platformOptions.protocols)),
      fileAssociations: asArray(packager.config.fileAssociations).concat(asArray(packager.platformOptions.fileAssociations)),
      addAutoLaunchExtension: options.addAutoLaunchExtension,
      customExtensionsPath: options.customExtensionsPath,
      appDir: packager.appDir,
      executable,
      displayName,
      dependencyNames: packager.metadata.dependencies,
    })

    const servicesXml = buildWindowsServicesXml(options.windowsServices, executable)

    if (!servicesXml) {
      return baseExtensions
    }

    if (baseExtensions === "") {
      return `<Extensions>${servicesXml}</Extensions>`
    }

    return baseExtensions.replace("</Extensions>", `${servicesXml}</Extensions>`)
  }
}
