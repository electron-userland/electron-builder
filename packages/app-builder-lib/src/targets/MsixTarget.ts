import { Arch, asArray, copyOrLinkFile, ensureNotBusy, exec, InvalidConfigurationError, log } from "builder-util"
import { getPath7za } from "../toolsets/7zip.js"
import _fsExtra from "fs-extra"
const { emptyDir, mkdirs, readdir, readFile, remove, writeFile } = _fsExtra
import * as path from "path"
import { MsixOptions } from "../options/MsixOptions.js"
import { getWindowsKitsBundle, isLegacyWinCodeSign, isOldWin6 } from "../toolsets/winCodeSign.js"
import { Target } from "../core.js"
import { getTemplatePath } from "../util/pathManager.js"
import type { VmManager } from "../vm/vm.js"
import { WinPackager } from "../winPackager.js"
import { createStageDir } from "./targetUtil.js"
import {
  APPX_ASSETS_DIR_NAME,
  buildAppFileMappings,
  buildCapabilitiesXml,
  buildExtensionsXml,
  buildWindowsServicesXml,
  computeUserAssets,
  defaultTileTag,
  isScaledAssetsProvided,
  lockScreenTag,
  resolvePackageApplicationId,
  resolvePackageIdentityName,
  resourceLanguageTag,
  splashScreenTag,
  substituteManifestMacros,
} from "./appxUtil.js"

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

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const toolsetVersion = packager.config.toolsets?.winCodeSign
    // unset / null / "latest" and any modern version pin resolve to a modern Windows Kits bundle (with the
    // MSIX SDK); only the explicit legacy "0.0.0" (winCodeSign-2.6.0) pin lacks it. A custom { url } toolset
    // is the user's responsibility.
    if (isLegacyWinCodeSign(toolsetVersion)) {
      throw new InvalidConfigurationError(
        'MSIX packaging requires a modern Windows Kits toolset. The legacy "0.0.0" (winCodeSign-2.6.0) bundle does not include the Windows SDK version required for MSIX. ' +
          'Use the default toolset or pin "toolsets.winCodeSign" to a modern version (e.g. "1.0.0", "1.1.0", or "1.3.0").'
      )
    }

    const artifactName = packager.expandArtifactBeautyNamePattern(this.options, "msix", arch)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.emitArtifactBuildStarted({
      targetPresentableName: "MSIX",
      file: artifactPath,
      arch,
    })

    const vendorPath = await getWindowsKitsBundle({ winCodeSign: toolsetVersion, resourcesDir: packager.buildResourcesDir })
    const vm = await packager.vm.value

    // Cache for use in finishBuild
    this.vendorPathKit = vendorPath.kit
    this.vm = vm

    this.builtPackages.set(arch, artifactPath)

    const stageDir = await createStageDir(this, packager, arch)

    const mappingFile = stageDir.getTempFile("mapping.txt")
    const makeAppXArgs = ["pack", "/o", "/f", vm.toVmFile(mappingFile), "/p", vm.toVmFile(artifactPath)]
    if (packager.compression === "store") {
      makeAppXArgs.push("/nc")
    }

    const mappingList: Array<Array<string>> = []
    mappingList.push(await buildAppFileMappings(vm, appOutDir))

    const userAssetDir = await packager.getResource(undefined, APPX_ASSETS_DIR_NAME)
    const assetInfo = await computeUserAssets(vm, vendorPath.appxAssets, userAssetDir)
    const userAssets = assetInfo.userAssets

    const manifestFile = stageDir.getTempFile("AppxManifest.xml")
    await this.writeManifest(manifestFile, arch, await this.computePublisherName(), userAssets)

    await packager.emitAppxManifestCreated(manifestFile)
    mappingList.push(assetInfo.mappings)
    mappingList.push([`"${vm.toVmFile(manifestFile)}" "AppxManifest.xml"`])

    if (isScaledAssetsProvided(userAssets)) {
      const outFile = vm.toVmFile(stageDir.getTempFile("resources.pri"))
      const makePriExe = path.join(vendorPath.kit, "makepri.exe")
      const makePriPath = vm.toVmFile(makePriExe)

      const assetRoot = stageDir.getTempFile("appx/assets")
      await emptyDir(assetRoot)
      await Promise.all(assetInfo.allAssets.map(it => copyOrLinkFile(it, path.join(assetRoot, path.basename(it)))))

      // Wait out any transient AV/share lock on the freshly-extracted kit binary (see ensureNotBusy).
      await ensureNotBusy(makePriExe)
      await vm.exec(makePriPath, [
        "new",
        "/Overwrite",
        "/Manifest",
        vm.toVmFile(manifestFile),
        "/ProjectRoot",
        vm.toVmFile(path.dirname(assetRoot)),
        "/ConfigXml",
        vm.toVmFile(path.join(getTemplatePath("appx"), "priconfig.xml")),
        "/OutputFile",
        outFile,
      ])

      for (const resourceFile of (await readdir(stageDir.dir)).filter(it => it.startsWith("resources.")).sort()) {
        mappingList.push([`"${vm.toVmFile(stageDir.getTempFile(resourceFile))}" "${resourceFile}"`])
      }
      makeAppXArgs.push("/l")
    }

    let mapping = "[Files]"
    for (const list of mappingList) {
      mapping += "\r\n" + list.join("\r\n")
    }
    await writeFile(mappingFile, mapping)
    packager.debugLogger.add("msix.mapping", mapping)

    if (this.options.makeappxArgs != null) {
      makeAppXArgs.push(...this.options.makeappxArgs)
    }

    this.buildQueueManager.add(async () => {
      try {
        const makeAppxExe = path.join(vendorPath.kit, "makeappx.exe")
        // The kit binary is often freshly extracted to a cold cache; on Windows an AV scanner can briefly
        // hold a deny-write lock long enough that spawning fails. Wait for it to clear (see ensureNotBusy).
        await ensureNotBusy(makeAppxExe)
        await vm.exec(vm.toVmFile(makeAppxExe), makeAppXArgs)
        await packager.signIf(artifactPath)
      } finally {
        await stageDir.cleanup()
      }
      await packager.emitArtifactBuildCompleted({
        file: artifactPath,
        packager,
        arch,
        safeArtifactName: packager.computeSafeArtifactName(artifactName, "msix"),
        target: this,
        isWriteUpdateInfo: this.options.electronUpdaterAware,
      })
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

  private async computePublisherName() {
    const signtoolManager = await this.packager.signingManager.value
    return signtoolManager.computePublisherName(this, this.options.publisher ?? null)
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
