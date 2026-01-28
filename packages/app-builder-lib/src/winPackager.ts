import { Arch, CopyFileTransformer, executeAppBuilder, FileTransformer, InvalidConfigurationError, log, use, walk } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { createHash } from "crypto"
import { readdir } from "fs/promises"
import { isCI } from "ci-info"
import { Lazy } from "lazy-val"
import * as path from "path"
import { SignManager } from "./codeSign/signManager.js"
import { signWindows, WindowsSignOptions } from "./codeSign/windowsCodeSign.js"
import { WindowsSignAzureManager } from "./codeSign/windowsSignAzureManager.js"
import { FileCodeSigningInfo, getSignVendorPath, WindowsSignToolManager } from "./codeSign/windowsSignToolManager.js"
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
import { time } from "./util/timer.js"
import { getWindowsVm, VmManager } from "./vm/vm.js"
import { execWine } from "./wine.js"

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
                return require("electron-builder-squirrel-windows").default
              } catch (e: any) {
                throw new InvalidConfigurationError(`Module electron-builder-squirrel-windows must be installed in addition to build Squirrel.Windows: ${e.stack || e}`)
              }

            case "appx":
              return require("./targets/AppxTarget").default

            case "msi":
              return require("./targets/MsiTarget").default

            case "msiwrapped":
              return require("./targets/MsiWrappedTarget").default

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

    this.signingQueue = this.signingQueue.then(() => this._sign(file))
    return this.signingQueue
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

    const args = [
      file,
      "--set-version-string",
      "FileDescription",
      appInfo.productName,
      "--set-version-string",
      "ProductName",
      appInfo.productName,
      "--set-version-string",
      "LegalCopyright",
      appInfo.copyright,
      "--set-file-version",
      appInfo.shortVersion || appInfo.buildVersion,
      "--set-product-version",
      appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm(),
    ]

    if (internalName != null) {
      args.push("--set-version-string", "InternalName", internalName, "--set-version-string", "OriginalFilename", "")
    }

    if (requestedExecutionLevel != null && requestedExecutionLevel !== "asInvoker") {
      args.push("--set-requested-execution-level", requestedExecutionLevel)
    }

    use(appInfo.companyName, it => args.push("--set-version-string", "CompanyName", it))
    use(this.platformSpecificBuildOptions.legalTrademarks, it => args.push("--set-version-string", "LegalTrademarks", it))
    const iconPath = await this.getIconPath()
    use(iconPath, it => {
      files.push(it)
      args.push("--set-icon", it)
    })

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
      hash.update(JSON.stringify(args))
      hash.update(this.platformSpecificBuildOptions.signtoolOptions?.certificateSha1 || "no certificateSha1")
      hash.update(this.platformSpecificBuildOptions.signtoolOptions?.certificateSubjectName || "no subjectName")

      buildCacheManager = new BuildCacheManager(outDir, file, arch)
      if (await buildCacheManager.copyIfValid(await digest(hash, files))) {
        timer.end()
        return
      }
      timer.end()
    }

    const timer = time("wine&sign")
    // rcedit crashed of executed using wine, resourcehacker works
    if (process.platform === "win32" || process.platform === "darwin") {
      await executeAppBuilder(["rcedit", "--args", JSON.stringify(args)], undefined /* child-process */, {}, 3 /* retry three times */)
    } else if (this.info.framework.name === "electron") {
      const vendorPath = await getSignVendorPath()
      await execWine(path.join(vendorPath, "rcedit-ia32.exe"), path.join(vendorPath, "rcedit-x64.exe"), args)
    }

    await this.signIf(file)
    timer.end()

    if (buildCacheManager != null) {
      await buildCacheManager.save()
    }
  }

  private shouldSignFile(file: string, fallbackValue = false): boolean {
    const backwardCompatibility = file.endsWith(".exe")
    const signExts = this.platformSpecificBuildOptions.signExts
    if (!signExts?.length) {
      return backwardCompatibility || fallbackValue
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
    // if no explicit patterns matched, fall back to backward compatibility
    return backwardCompatibility || fallbackValue
  }

  protected createTransformerForExtraFiles(packContext: AfterPackContext): FileTransformer | null {
    if (this.platformSpecificBuildOptions.signAndEditExecutable === false) {
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
    if (this.platformSpecificBuildOptions.signAndEditExecutable === false) {
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

    if (!isAsar) {
      return true
    }

    const filesPromise = (filepath: string[]) => {
      const outDir = path.join(packContext.appOutDir, ...filepath)
      return walk(outDir, (file, stat) => stat.isDirectory() || this.shouldSignFile(file))
    }
    const filesToSign = await Promise.all([filesPromise(["resources", "app.asar.unpacked"]), filesPromise(["swiftshader"])])
    for (const file of filesToSign.flat(1)) {
      await this.signIf(file)
    }

    return true
  }
}
