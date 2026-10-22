import { Arch, asArray, copyOrLinkFile, ensureNotBusy, exec, InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { computePackageFamilyName, getPackageIdentity, MSIX_UPDATER_ELECTRON_VERSION_RANGE } from "builder-util-runtime/internal"
import { getPath7za } from "../../toolsets/7zip.js"
import _fsExtra from "fs-extra"
const { mkdirs, readFile, remove, writeFile } = _fsExtra
import * as path from "path"
import * as semver from "semver"
import type { Configuration } from "../../configuration.js"
import { MsixOptions } from "../../options/MsixOptions.js"
import { isLegacyWinCodeSign, isOldWin6 } from "../../toolsets/winCodeSign.js"
import { Target } from "../../core.js"
import { hashFile } from "../../util/hash.js"
import { getTemplatePath } from "../../util/pathManager.js"
import type { VmManager } from "../../vm/vm.js"
import { WinPackager } from "../../winPackager.js"
import type { StageDir } from "../targetUtil.js"
import {
  buildAppxPackage,
  buildCapabilitiesXml,
  buildExtensionsXml,
  buildWindowsServicesXml,
  defaultTileTag,
  isMappedTo,
  isPackageTypeMapping,
  lockScreenTag,
  PACKAGE_TYPE_MAPPING_DESTINATION,
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
  // the manifest that is packed (after the appxManifestCreated hook): the bundle version and the update-info hints come from it
  private finalManifest: string | null = null

  constructor(
    private readonly packager: WinPackager,
    readonly outDir: string
  ) {
    super("msix")

    if (process.platform !== "darwin" && (process.platform !== "win32" || isOldWin6())) {
      throw new Error("MSIX is supported on Windows 10 or Windows Server 2012 R2 (version number 6.3+) and on macOS via Parallels Desktop")
    }

    // checked here so a misconfiguration fails before the build-start signing preflight and before anything is packed
    if (this.writesUpdateInfo) {
      this.checkElectronUpdaterAware()
    }
  }

  get writesUpdateInfo(): boolean {
    return this.options.electronUpdaterAware === true
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
      mapAppFiles: (mappings, stageDir, vm) => this.mapAppFiles(mappings, stageDir, vm),
      onManifestFinalized: content => {
        this.finalManifest = content
      },
    })
  }

  private checkElectronUpdaterAware(): void {
    if (this.options.createMsixbundle === false) {
      throw new InvalidConfigurationError(
        '"msix.electronUpdaterAware" requires the .msixbundle: electron-updater updates MSIX installs from the bundle only, since an app installed from a bundle cannot be updated by a single .msix. Remove "msix.createMsixbundle: false".'
      )
    }

    const packager = this.packager
    // Windows installs any package signed with a trusted certificate, even another app's: MsixUpdater only trusts a bundle pinned by a signed manifest
    if (packager.updateManifestOptions === false) {
      throw new InvalidConfigurationError(
        '"msix.electronUpdaterAware" requires signed update manifests: MsixUpdater refuses an update whose manifest it cannot verify. Remove "updateManifest: false" and configure a signing key (see https://www.electron.build/docs/features/signed-update-manifests).'
      )
    }
    assertMsixUpdaterElectronVersion(packager.config.electronVersion, packager.config, packager.packagerOptions.prepackaged != null)

    // the 4-part package version has no prerelease part: without a numeric build number, 1.2.0-beta.1 and 1.2.0 are both 1.2.0.0
    const appInfo = packager.appInfo
    const isSetBuildNumber = this.options.setBuildNumber === true
    if (semver.prerelease(appInfo.version) != null && (!isSetBuildNumber || appInfo.buildNumber == null || !/^\d+$/.test(appInfo.buildNumber))) {
      log.once("msix-updater-prerelease-version", this).warn(
        {
          version: appInfo.version,
          packageVersion: appInfo.getVersionInWeirdWindowsForm(isSetBuildNumber),
          solution: 'set "msix.setBuildNumber": true with an increasing numeric build number, or publish MSIX updates of release versions only',
        },
        "the MSIX package version drops the prerelease part, so a prerelease and its release get the same package version, and neither MsixUpdater nor Windows updates a package to the version it already has"
      )
    }
  }

  private async mapAppFiles(mappings: Array<string>, stageDir: StageDir, vm: VmManager): Promise<Array<string>> {
    // a package-type walked from the app dir (e.g. a prepackaged NSIS install) would select another updater, and makeappx rejects a destination mapped twice
    const result = mappings.filter(it => !isPackageTypeMapping(it))
    if (!this.writesUpdateInfo) {
      return result
    }

    // electron-updater selects MsixUpdater by this marker; written to the stage dir, not to the app dir other targets read
    const marker = stageDir.getTempFile("package-type")
    await writeFile(marker, "msix")
    result.push(`"${vm.toVmFile(marker)}" "${PACKAGE_TYPE_MAPPING_DESTINATION}"`)

    // afterPack writes it from the publish configuration, but a prepackaged app gets no afterPack
    if (!mappings.some(it => isMappedTo(it, "app\\resources\\app-update.yml"))) {
      log
        .once("msix-updater-no-app-update-yml", this)
        .warn(
          { solution: "configure publish and build from the project (not --prepackaged), or add an app-update.yml to the resources of the prepackaged app" },
          "the MSIX package has no resources\\app-update.yml, so MsixUpdater has no update feed"
        )
    }
    return result
  }

  async finishBuild(): Promise<void> {
    await super.finishBuild()

    const packagePaths = Array.from(this.builtPackages.values())
    if (packagePaths.length === 0) {
      return
    }

    let bundlePath: string | undefined
    // electron-updater updates MSIX installs from the .msixbundle only (an app installed from a bundle cannot take a single .msix), so it is built for one architecture too
    if (this.options.createMsixbundle !== false && (packagePaths.length > 1 || this.writesUpdateInfo)) {
      bundlePath = await this.createMsixBundle(packagePaths)
    }

    if (this.options.createMsixupload === true) {
      await this.createMsixUpload(bundlePath ?? packagePaths[0])
    }
  }

  private async createMsixBundle(packagePaths: ReadonlyArray<string>): Promise<string> {
    const packager = this.packager
    const { vm, vendorPathKit: kitPath, finalManifest } = this
    // set by every build of a package, which finishBuild bundles
    if (vm == null || kitPath == null || finalManifest == null) {
      throw new Error("Cannot create the .msixbundle: no MSIX package was built (the Windows SDK, the VM or the package manifest is unknown)")
    }
    // the packages of a bundle share their identity apart from the architecture
    const identity = getPackageIdentity(finalManifest)

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
      // /bv: the bundle gets the version of its packages instead of makeappx's date-based default
      await vm.exec(vm.toVmFile(makeAppxExe), ["bundle", "/o", "/bv", identity.version, "/d", vm.toVmFile(stagingDir), "/p", vm.toVmFile(bundlePath)])
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
      isWriteUpdateInfo: this.writesUpdateInfo,
      // unsigned hints (like isAdminRightsRequired) that let MsixUpdater refuse another package family, or a version Windows would not install,
      // before downloading; the bundle itself is pinned by its sha512, which the manifest signature covers
      updateInfo: this.writesUpdateInfo
        ? {
            sha512: await hashFile(bundlePath),
            packageFamilyName: computePackageFamilyName(identity.name, identity.publisher),
            packageVersion: identity.version,
          }
        : undefined,
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

/**
 * Fails a build with `msix.electronUpdaterAware` whose Electron cannot install the update electron-updater downloads (through its
 * native MSIX autoUpdater). Only warns when the Electron that runs in the package is unknown: an unparseable version, a custom
 * `electronDist` or a prepackaged app. A mirror serves the declared version, so that is still checked.
 * @internal exported for tests
 */
export function assertMsixUpdaterElectronVersion(electronVersion: string | Nullish, config: Configuration, isPrepackaged: boolean): void {
  const requirement =
    "msix.electronUpdaterAware requires an Electron whose MSIX autoUpdater installs the update electron-updater downloads: 39.5.2+ (39.x), 40.2.1+ (40.x), 41.0.0-alpha.6+ or 42+"
  const electronDist = config.electronDist
  const isCustomElectronDist = electronDist != null && (typeof electronDist !== "string" || !isEmptyOrSpaces(electronDist))
  if (electronVersion == null || semver.valid(electronVersion) == null || isCustomElectronDist || isPrepackaged) {
    const reason = isPrepackaged ? "prepackaged app" : isCustomElectronDist ? "custom electronDist" : "unparseable Electron version"
    log
      .once("msix-updater-electron-version", config)
      .warn({ electronVersion, reason }, `${requirement}. The Electron of this build cannot be checked: MsixUpdater stays inactive on an older one`)
    return
  }
  if (!semver.satisfies(electronVersion, MSIX_UPDATER_ELECTRON_VERSION_RANGE, { includePrerelease: true })) {
    throw new InvalidConfigurationError(`${requirement}. This build uses Electron ${electronVersion}.`)
  }
}
