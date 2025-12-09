import { Arch, CopyFileTransformer, exists, FileTransformer, InvalidConfigurationError, log, walk } from "builder-util"
import { createRequire } from "node:module"
import { Nullish } from "builder-util-runtime"
import { isCI } from "ci-info"
import { createHash } from "crypto"
import { readdir } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"
<<<<<<< HEAD
import { readAsarHeader } from "./asar/asar.js"
import { SignManager } from "./codeSign/signManager.js"
import { signWindows, WindowsSignOptions } from "./codeSign/windowsCodeSign.js"
import { WindowsSignAzureManager } from "./codeSign/windowsSignAzureManager.js"
import { FileCodeSigningInfo, WindowsSignToolManager } from "./codeSign/windowsSignToolManager.js"
import { AfterPackContext } from "./configuration.js"
import { DIR_TARGET, Platform, Target } from "./core.js"
import { RequestedExecutionLevel, WindowsConfiguration } from "./options/winOptions.js"
import { Packager } from "./packager.js"
import { chooseNotNull, PlatformPackager } from "./platformPackager.js"
import AppXTarget from "./targets/AppxTarget.js"
import MsiTarget from "./targets/MsiTarget.js"
import MsiWrappedTarget from "./targets/MsiWrappedTarget.js"
import { NsisTarget } from "./targets/nsis/NsisTarget.js"
import { AppPackageHelper, CopyElevateHelper } from "./targets/nsis/nsisUtil.js"
import { WebInstallerTarget } from "./targets/nsis/WebInstallerTarget.js"
import { createCommonTarget } from "./targets/targetFactory.js"
import { BuildCacheManager, digest } from "./util/cacheManager.js"
import { isBuildCacheEnabled } from "./util/flags.js"
import { editWindowsResources, ResourceEditOptions } from "./util/resEdit.js"
import { time } from "./util/timer.js"
import { getWindowsVm, VmManager } from "./vm/vm.js"

const _require = createRequire(import.meta.url)
=======
import { SignManager } from "./codeSign/signManager.js.js"
import { signWindows, WindowsSignOptions } from "./codeSign/windowsCodeSign.js.js"
import { WindowsSignAzureManager } from "./codeSign/windowsSignAzureManager.js.js"
import { FileCodeSigningInfo, getSignVendorPath, WindowsSignToolManager } from "./codeSign/windowsSignToolManager.js.js"
import { AfterPackContext } from "./configuration.js.js"
import { DIR_TARGET, Platform, Target } from "./core.js.js"
import { RequestedExecutionLevel, WindowsConfiguration } from "./options/winOptions.js.js"
import { Packager } from "./packager.js.js"
import { chooseNotNull, PlatformPackager } from "./platformPackager.js.js"
import AppXTarget from "./targets/AppxTarget.js.js"
import MsiTarget from "./targets/MsiTarget.js.js"
import MsiWrappedTarget from "./targets/MsiWrappedTarget.js.js"
import { NsisTarget } from "./targets/nsis/NsisTarget.js.js"
import { AppPackageHelper, CopyElevateHelper } from "./targets/nsis/nsisUtil.js.js"
import { WebInstallerTarget } from "./targets/nsis/WebInstallerTarget.js.js"
import { createCommonTarget } from "./targets/targetFactory.js.js"
import { BuildCacheManager, digest } from "./util/cacheManager.js.js"
import { isBuildCacheEnabled } from "./util/flags.js.js"
import { time } from "./util/timer.js.js"
import { getWindowsVm, VmManager } from "./vm/vm.js.js"
import { execWine } from "./wine.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)

export class WinPackager extends PlatformPackager<WindowsConfiguration> {
  _iconPath = new Lazy(() => this.getOrConvertIcon("ico"))

  readonly vm = new Lazy<VmManager>(() => (process.platform === "win32" ? Promise.resolve(new VmManager()) : getWindowsVm(this.debugLogger)))

  readonly signingManager = new Lazy(async () => {
    let manager: SignManager
    if (this.platformSpecificBuildOptions.azureSignOptions != null) {
      manager = new WindowsSignAzureManager(this)
    } else {
      manager = new WindowsSignToolManager(this)
    }
    await manager.initialize()
    return manager
  })
  private signingQueue = Promise.resolve(true)

  get isForceCodeSigningVerification(): boolean {
    return this.platformSpecificBuildOptions.verifyUpdateCodeSignature !== false
  }

  constructor(info: Packager) {
    super(info, Platform.WINDOWS)
  }

  get defaultTarget(): Array<string> {
    return ["nsis"]
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
    let copyElevateHelper: CopyElevateHelper | null
    const getCopyElevateHelper = () => {
      if (copyElevateHelper == null) {
        copyElevateHelper = new CopyElevateHelper()
      }
      return copyElevateHelper
    }

    let helper: AppPackageHelper | null
    const getHelper = () => {
      if (helper == null) {
        helper = new AppPackageHelper(getCopyElevateHelper())
      }
      return helper
    }

    for (const name of targets) {
      if (name === DIR_TARGET) {
        continue
      }

      if (name === "nsis" || name === "portable") {
        mapper(name, outDir => new NsisTarget(this, outDir, name, getHelper()))
      } else if (name === "nsis-web") {
        // package file format differs from nsis target
        mapper(name, outDir => new WebInstallerTarget(this, path.join(outDir, name), name, new AppPackageHelper(getCopyElevateHelper())))
      } else {
        const targetClass: typeof NsisTarget | typeof AppXTarget | typeof MsiTarget | typeof MsiWrappedTarget | null = (() => {
          switch (name) {
            case "squirrel":
              try {
                return _require("electron-builder-squirrel-windows").default
              } catch (e: any) {
                throw new InvalidConfigurationError(`Module electron-builder-squirrel-windows must be installed in addition to build Squirrel.Windows: ${e.stack || e}`)
              }

            case "appx":
              return AppXTarget

            case "msi":
              return MsiTarget

            case "msiwrapped":
              return MsiWrappedTarget

            default:
              return null
          }
        })()

        mapper(name, outDir => (targetClass === null ? createCommonTarget(name, outDir, this) : new (targetClass as any)(this, outDir, name)))
      }
    }
  }

  getIconPath() {
    return this._iconPath.value
  }

  doGetCscPassword(): string | Nullish {
    return chooseNotNull(chooseNotNull(this.platformSpecificBuildOptions.signtoolOptions?.certificatePassword, process.env.WIN_CSC_KEY_PASSWORD), super.doGetCscPassword())
  }

  async signIf(file: string): Promise<boolean> {
    const logFields = { file: log.filePath(file) }
    if (!this.shouldSignFile(file, true)) {
      log.info(logFields, "file signing skipped via signExts configuration")
      return false
    }
    if (this.platformSpecificBuildOptions.signExecutable === false) {
      log.info(logFields, "file signing skipped via signExecutable configuration")
      return false
    }

    const promise = this.signingQueue.then(() => this._sign(file))
    this.signingQueue = promise.catch(e => {
      log.warn({ file: log.filePath(file), error: e.message }, "signing failed for file, queue will continue to next file")
      return false
    })
    return promise
  }

  private async _sign(file: string): Promise<boolean> {
    const signOptions: WindowsSignOptions = {
      path: file,
      options: this.platformSpecificBuildOptions,
    }

    const didSignSuccessfully = await signWindows(signOptions, this)
    if (!didSignSuccessfully && this.forceCodeSigning) {
      throw new InvalidConfigurationError(
        `App is not signed and "forceCodeSigning" is set to true, please ensure that code signing configuration is correct, please see https://electron.build/code-signing`
      )
    }
    return didSignSuccessfully
  }

  async signAndEditResources(file: string, arch: Arch, outDir: string, internalName?: string | null, requestedExecutionLevel?: RequestedExecutionLevel | null) {
    const appInfo = this.appInfo

    const files: Array<string> = []

    const versionStrings: Record<string, string> = {
      FileDescription: appInfo.productName,
      ProductName: appInfo.productName,
      LegalCopyright: appInfo.copyright,
    }

    if (internalName != null) {
      versionStrings.InternalName = internalName
      versionStrings.OriginalFilename = ""
    }

    if (appInfo.companyName != null) {
      versionStrings.CompanyName = appInfo.companyName
    }
    if (this.platformSpecificBuildOptions.legalTrademarks != null) {
      versionStrings.LegalTrademarks = this.platformSpecificBuildOptions.legalTrademarks
    }

    const iconPath = await this.getIconPath()
    if (iconPath != null) {
      files.push(iconPath)
    }

    const opts: ResourceEditOptions = {
      file,
      versionStrings,
      fileVersion: appInfo.shortVersion || appInfo.buildVersion,
      productVersion: appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm(),
      requestedExecutionLevel,
      iconPath,
    }

    const config = this.config
    const cscInfoForCacheDigest = !isBuildCacheEnabled() || isCI || config.electronDist != null ? null : await (await this.signingManager.value).cscInfo.value
    let buildCacheManager: BuildCacheManager | null = null
    // resources editing doesn't change executable for the same input and executed quickly - no need to complicate
    if (cscInfoForCacheDigest != null) {
      const cscFile = (cscInfoForCacheDigest as FileCodeSigningInfo).file
      if (cscFile != null) {
        files.push(cscFile)
      }

      const timer = time("executable cache")
      const hash = createHash("sha512")
      hash.update(config.electronVersion || "no electronVersion")
      hash.update(JSON.stringify(this.platformSpecificBuildOptions))
      hash.update(JSON.stringify(opts))
      hash.update(this.platformSpecificBuildOptions.signtoolOptions?.certificateSha1 || "no certificateSha1")
      hash.update(this.platformSpecificBuildOptions.signtoolOptions?.certificateSubjectName || "no subjectName")

      const asar = path.resolve(this.getResourcesDir(outDir), "app.asar")
      if (await exists(asar)) {
        hash.update((await readAsarHeader(asar)).header)
      } else {
        hash.update("no asar")
      }

      buildCacheManager = new BuildCacheManager(outDir, file, arch)
      if (await buildCacheManager.copyIfValid(await digest(hash, files))) {
        timer.end()
        return
      }
      timer.end()
    }

    const timer = time("resource-edit&sign")
    await editWindowsResources(opts)
    await this.signIf(file)
    timer.end()

    if (buildCacheManager != null) {
      await buildCacheManager.save()
    }
  }

  private shouldSignFile(file: string, fallbackValue = false): boolean {
    const isExe = file.endsWith(".exe")
    const signExts = this.platformSpecificBuildOptions.signExts
    if (!signExts?.length) {
      return isExe || fallbackValue
    }
    // process patterns ( !exe => exclude .exe, .dll => include .dll )
    // we process first to allow literal negatives in case a filename matches "help!.txt" or similar
    if (signExts.some(ext => file.endsWith(ext))) {
      return true
    }
    // process negative patterns
    if (signExts.some(ext => ext.startsWith("!") && file.endsWith(ext.substring(1)))) {
      return false
    }
    return isExe || fallbackValue
  }

  protected createTransformerForExtraFiles(packContext: AfterPackContext): FileTransformer | null {
    if (this.platformSpecificBuildOptions.signAndEditExecutable === false || this.platformSpecificBuildOptions.signExecutable === false) {
      return null
    }

    return file => {
      if (this.shouldSignFile(file)) {
        const parentDir = path.dirname(file)
        if (parentDir !== packContext.appOutDir) {
          return new CopyFileTransformer(file => this.signIf(file))
        }
      }
      return null
    }
  }

  protected async signApp(packContext: AfterPackContext, isAsar: boolean): Promise<boolean> {
    const exeFileName = `${this.appInfo.productFilename}.exe`
    const signingDisabled = this.platformSpecificBuildOptions.signExecutable === false || this.platformSpecificBuildOptions.signAndEditExecutable === false
    if (signingDisabled && this.forceCodeSigning) {
      throw new InvalidConfigurationError(
        "Signing is disabled (`signExecutable: false` or `signAndEditExecutable: false`) but `forceCodeSigning` is enabled. Remove one of these options."
      )
    }
    if (this.platformSpecificBuildOptions.signAndEditExecutable === false) {
      log.info(
        { exe: log.filePath(path.join(packContext.appOutDir, exeFileName)) },
        "executable resource editing and code signing skipped — signAndEditExecutable is false. To skip only code signing while keeping icon and metadata applied, use signExecutable: false instead."
      )
      return false
    }

    const files = await readdir(packContext.appOutDir)
    for (const file of files) {
      if (file === exeFileName) {
        await this.signAndEditResources(
          path.join(packContext.appOutDir, exeFileName),
          packContext.arch,
          packContext.outDir,
          path.basename(exeFileName, ".exe"),
          this.platformSpecificBuildOptions.requestedExecutionLevel
        )
      } else if (this.shouldSignFile(file)) {
        await this.signIf(path.join(packContext.appOutDir, file))
      }
    }

    if (!isAsar || this.platformSpecificBuildOptions.signExecutable === false) {
      return true
    }

    const filesToSign = await Promise.all([
      this.walkSignableFiles(packContext.appOutDir, "resources", "app.asar.unpacked"),
      // Note: The `swiftshader` directory is absent in modern electron versions. `swiftshader/` held Chromium's legacy SwiftShader GL fallback (libEGL.dll / libGLESv2.dll), removed in Chromium 102 (Electron 19+) in favor of SwANGLE (ANGLE + SwiftShader Vulkan). This is kept here only for backwards compat with older Electron; `walk` no-ops on a missing dir (readdir ENOENT is swallowed), so this is harmless when the directory is absent.
      this.walkSignableFiles(packContext.appOutDir, "swiftshader"),
    ])
    for (const file of filesToSign.flat(1)) {
      await this.signIf(file)
    }

    return true
  }

  private walkSignableFiles(baseDir: string, ...subpath: string[]): Promise<string[]> {
    return walk(path.join(baseDir, ...subpath), (file, stat) => stat.isDirectory() || this.shouldSignFile(file))
  }
}
