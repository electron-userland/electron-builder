import { Arch, asArray, copyOrLinkFile, ensureNotBusy, escapeForXml, InvalidConfigurationError, log } from "builder-util"

import path from "path"
import { AppXOptions } from "../../index.js"
import { getWindowsKitsBundle, isOldWin6 } from "../../toolsets/winCodeSign.js"
import { Target } from "../../core.js"
import { getTemplatePath } from "../../util/pathManager.js"
import { WinPackager } from "../../winPackager.js"
import { createStageDir } from "../targetUtil.js"
// Shared with the MSIX target — appxUtil is the single source of truth for manifest helpers.
import {
  buildAppFileMappings,
  buildCapabilitiesXml,
  buildExtensionsXml,
  computeUserAssets,
  defaultTileTag,
  isScaledAssetsProvided,
  lockScreenTag,
  resolvePackageApplicationId,
  resolvePackageIdentityName,
  resourceLanguageTag,
  splashScreenTag,
} from "../appxUtil.js"
import _fsExtra from "fs-extra"
const { emptyDir, readdir, readFile, writeFile } = _fsExtra

const APPX_ASSETS_DIR_NAME = "appx"

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
  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const artifactName = packager.expandArtifactBeautyNamePattern(this.options, "appx", arch)
    const artifactPath = path.join(this.outDir, artifactName)
    await packager.emitArtifactBuildStarted({
      targetPresentableName: "AppX",
      file: artifactPath,
      arch,
    })

    const vendorPath = await getWindowsKitsBundle({ winCodeSign: this.packager.config.toolsets?.winCodeSign, resourcesDir: this.packager.buildResourcesDir })
    const vm = await packager.vm.value

    const stageDir = await createStageDir(this, packager, arch)

    const mappingFile = stageDir.getTempFile("mapping.txt")
    const makeAppXArgs = ["pack", "/o" /* overwrite the output file if it exists */, "/f", vm.toVmFile(mappingFile), "/p", vm.toVmFile(artifactPath)]
    if (packager.compression === "store") {
      makeAppXArgs.push("/nc")
    }

    const mappingList: Array<Array<string>> = []
    mappingList.push(await buildAppFileMappings(vm, appOutDir))

    const userAssetDir = await this.packager.getResource(undefined, APPX_ASSETS_DIR_NAME)
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

      // in addition to resources.pri, resources.scale-140.pri and other such files will be generated
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
    packager.debugLogger.add("appx.mapping", mapping)

    if (this.options.makeappxArgs != null) {
      makeAppXArgs.push(...this.options.makeappxArgs)
    }
    this.buildQueueManager.add(async () => {
      const makeAppxExe = path.join(vendorPath.kit, "makeappx.exe")
      // The kit binary is often freshly extracted to a cold cache; on Windows an AV scanner can hold a
      // deny-write lock on it just long enough that CreateProcess fails with `spawn UNKNOWN`. Wait for
      // the lock to clear before spawning. See ensureNotBusy.
      await ensureNotBusy(makeAppxExe)
      await vm.exec(vm.toVmFile(makeAppxExe), makeAppXArgs)
      await packager.signIf(artifactPath)

      await stageDir.cleanup()

      await packager.emitArtifactBuildCompleted({
        file: artifactPath,
        packager,
        arch,
        safeArtifactName: packager.computeSafeArtifactName(artifactName, "appx"),
        target: this,
        isWriteUpdateInfo: this.options.electronUpdaterAware,
      })
    })
  }

  private async computePublisherName() {
    const signtoolManager = await this.packager.signingManager.value
    // https://github.com/electron-userland/electron-builder/issues/2108#issuecomment-333200711
    return signtoolManager.computePublisherName(this, this.options.publisher ?? null)
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
    const manifest = manifestFileContent.replace(/\${([a-zA-Z0-9]+)}/g, (match, p1): string => {
      switch (p1) {
        case "publisher":
          return escapeForXml(publisher)

        case "publisherDisplayName": {
          const name = options.publisherDisplayName || appInfo.companyName
          if (name == null) {
            throw new InvalidConfigurationError(`Please specify "author" in the application package.json — it is required because "appx.publisherDisplayName" is not set.`)
          }
          return escapeForXml(name)
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
          return escapeForXml(displayName)

        case "description":
          return escapeForXml(appInfo.description || appInfo.productName)

        case "backgroundColor":
          return escapeForXml(options.backgroundColor || "#464646")

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
          return escapeForXml(options.minVersion || archSpecificMinVersion)

        case "maxVersionTested":
          return escapeForXml(options.maxVersionTested || options.minVersion || archSpecificMinVersion)

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
