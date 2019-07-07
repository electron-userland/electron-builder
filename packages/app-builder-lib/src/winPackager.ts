import BluebirdPromise from "bluebird-lst"
import { Arch, asArray, InvalidConfigurationError, log, use, executeAppBuilder } from "builder-util"
import { parseDn } from "builder-util-runtime"
import { CopyFileTransformer, FileTransformer, walk } from "builder-util/out/fs"
import { createHash } from "crypto"
import { readdir } from "fs-extra"
import isCI from "is-ci"
import { Lazy } from "lazy-val"
import * as path from "path"
import { downloadCertificate } from "./codeSign/codesign"
import { CertificateFromStoreInfo, CertificateInfo, FileCodeSigningInfo, getCertificateFromStoreInfo, getCertInfo, sign, WindowsSignOptions } from "./codeSign/windowsCodeSign"
import { AfterPackContext } from "./configuration"
import { DIR_TARGET, Platform, Target } from "./core"
import { RequestedExecutionLevel, WindowsConfiguration } from "./options/winOptions"
import { Packager } from "./packager"
import { chooseNotNull, PlatformPackager } from "./platformPackager"
import AppXTarget from "./targets/AppxTarget"
import { NsisTarget } from "./targets/nsis/NsisTarget"
import { AppPackageHelper, CopyElevateHelper } from "./targets/nsis/nsisUtil"
import { WebInstallerTarget } from "./targets/nsis/WebInstallerTarget"
import { createCommonTarget } from "./targets/targetFactory"
import { BuildCacheManager, digest } from "./util/cacheManager"
import { isBuildCacheEnabled } from "./util/flags"
import { time } from "./util/timer"
import { getWindowsVm, VmManager } from "./vm/vm"

export class WinPackager extends PlatformPackager<WindowsConfiguration> {
  readonly cscInfo = new Lazy<FileCodeSigningInfo | CertificateFromStoreInfo | null>(() => {
    const platformSpecificBuildOptions = this.platformSpecificBuildOptions
    if (platformSpecificBuildOptions.certificateSubjectName != null || platformSpecificBuildOptions.certificateSha1 != null) {
      return this.vm.value
        .then(vm => getCertificateFromStoreInfo(platformSpecificBuildOptions, vm))
        .catch(e => {
          // https://github.com/electron-userland/electron-builder/pull/2397
          if (platformSpecificBuildOptions.sign == null) {
            throw e
          }
          else {
            log.debug({error: e}, "getCertificateFromStoreInfo error")
            return null
          }
        })
    }

    const certificateFile = platformSpecificBuildOptions.certificateFile
    if (certificateFile != null) {
      const certificatePassword = this.getCscPassword()
      return Promise.resolve({
        file: certificateFile,
        password: certificatePassword == null ? null : certificatePassword.trim(),
      })
    }

    const cscLink = this.getCscLink("WIN_CSC_LINK")
    if (cscLink == null) {
      return Promise.resolve(null)
    }

    return downloadCertificate(cscLink, this.info.tempDirManager, this.projectDir)
      // before then
      .catch(e => {
        if (e instanceof InvalidConfigurationError) {
          throw new InvalidConfigurationError(`Env WIN_CSC_LINK is not correct, cannot resolve: ${e.message}`)
        }
        else {
          throw e
        }
      })
      .then(path => {
        return {
          file: path!!,
          password: this.getCscPassword(),
        }
      })
  })

  private _iconPath = new Lazy(() => this.getOrConvertIcon("ico"))

  readonly vm = new Lazy<VmManager>(() => process.platform === "win32" ? Promise.resolve(new VmManager()) : getWindowsVm(this.debugLogger))

  readonly computedPublisherName = new Lazy<Array<string> | null>(async () => {
    const publisherName = (this.platformSpecificBuildOptions as WindowsConfiguration).publisherName
    if (publisherName === null) {
      return null
    }
    else if (publisherName != null) {
      return asArray(publisherName)
    }

    const certInfo = await this.lazyCertInfo.value
    return certInfo == null ? null : [certInfo.commonName]
  })

  readonly lazyCertInfo = new Lazy<CertificateInfo | null>(async () => {
    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      return null
    }

    if ("subject" in cscInfo) {
      const bloodyMicrosoftSubjectDn = (cscInfo as CertificateFromStoreInfo).subject
      return {
        commonName: parseDn(bloodyMicrosoftSubjectDn).get("CN")!!,
        bloodyMicrosoftSubjectDn,
      }
    }

    const cscFile = (cscInfo as FileCodeSigningInfo).file
    if (cscFile == null) {
      return null
    }
    return await getCertInfo(cscFile, (cscInfo as FileCodeSigningInfo).password || "")
  })

  get isForceCodeSigningVerification(): boolean {
    return this.platformSpecificBuildOptions.verifyUpdateCodeSignature !== false
  }

  constructor(info: Packager) {
    super(info, Platform.WINDOWS)
  }

  get defaultTarget(): Array<string> {
    return ["nsis"]
  }

  protected doGetCscPassword(): string | undefined | null {
    return chooseNotNull(chooseNotNull(this.platformSpecificBuildOptions.certificatePassword, process.env.WIN_CSC_KEY_PASSWORD), super.doGetCscPassword())
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
      }
      else if (name === "nsis-web") {
        // package file format differs from nsis target
        mapper(name, outDir => new WebInstallerTarget(this, path.join(outDir, name), name, new AppPackageHelper(getCopyElevateHelper())))
      }
      else {
        const targetClass: typeof NsisTarget | typeof AppXTarget | null = (() => {
          switch (name) {
            case "squirrel":
              try {
                return require("electron-builder-squirrel-windows").default
              }
              catch (e) {
                throw new InvalidConfigurationError(`Module electron-builder-squirrel-windows must be installed in addition to build Squirrel.Windows: ${e.stack || e}`)
              }

            case "appx":
              return require("./targets/AppxTarget").default

            case "msi":
              return require("./targets/MsiTarget").default

            default:
              return null
          }
        })()

        mapper(name, outDir => targetClass === null ? createCommonTarget(name, outDir, this) : new (targetClass as any)(this, outDir, name))
      }
    }
  }

  getIconPath() {
    return this._iconPath.value
  }

  async sign(file: string, logMessagePrefix?: string): Promise<void> {
    const signOptions: WindowsSignOptions = {
      path: file,
      name: this.appInfo.productName,
      site: await this.appInfo.computePackageUrl(),
      options: this.platformSpecificBuildOptions,
    }

    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      if (this.platformSpecificBuildOptions.sign != null) {
        await sign(signOptions, this)
      }
      else if (this.forceCodeSigning) {
        throw new InvalidConfigurationError(`App is not signed and "forceCodeSigning" is set to true, please ensure that code signing configuration is correct, please see https://electron.build/code-signing`)
      }
      return
    }

    if (logMessagePrefix == null) {
      logMessagePrefix = "signing"
    }

    if ("file" in cscInfo) {
      log.info({
        file: log.filePath(file),
        certificateFile: (cscInfo as FileCodeSigningInfo).file,
      }, logMessagePrefix)
    }
    else {
      const info = cscInfo as CertificateFromStoreInfo
      log.info({
        file: log.filePath(file),
        subject: info.subject,
        thumbprint: info.thumbprint,
        store: info.store,
        user: info.isLocalMachineStore ? "local machine" : "current user",
      }, logMessagePrefix)
    }

    await this.doSign({
      ...signOptions,
      cscInfo,
      options: {
        ...this.platformSpecificBuildOptions,
      },
    })
  }

  private async doSign(options: WindowsSignOptions) {
    for (let i = 0; i < 3; i++) {
      try {
        await sign(options, this)
        break
      }
      catch (e) {
        // https://github.com/electron-userland/electron-builder/issues/1414
        const message = e.message
        if (message != null && message.includes("Couldn't resolve host name")) {
          log.warn({error: message, attempt: i + 1}, `cannot sign`)
          continue
        }
        throw e
      }
    }
  }

  async signAndEditResources(file: string, arch: Arch, outDir: string, internalName?: string | null, requestedExecutionLevel?: RequestedExecutionLevel | null) {
    const appInfo = this.appInfo

    const files: Array<string> = []

    const args = [
      file,
      "--set-version-string", "FileDescription", appInfo.productName,
      "--set-version-string", "ProductName", appInfo.productName,
      "--set-version-string", "LegalCopyright", appInfo.copyright,
      "--set-file-version", appInfo.buildVersion,
      "--set-product-version", appInfo.getVersionInWeirdWindowsForm(),
    ]

    if (internalName != null) {
      args.push(
        "--set-version-string", "InternalName", internalName,
        "--set-version-string", "OriginalFilename", "",
      )
    }

    if (requestedExecutionLevel != null && requestedExecutionLevel !== "asInvoker") {
      args.push("--set-requested-execution-level", requestedExecutionLevel)
    }

    use(appInfo.companyName, it => args.push("--set-version-string", "CompanyName", it!))
    use(this.platformSpecificBuildOptions.legalTrademarks, it => args.push("--set-version-string", "LegalTrademarks", it!))
    const iconPath = await this.getIconPath()
    use(iconPath, it => {
      files.push(it)
      args.push("--set-icon", it)
    })

    const config = this.config
    const cscInfoForCacheDigest = !isBuildCacheEnabled() || isCI || config.electronDist != null ? null : await this.cscInfo.value
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
      hash.update(this.platformSpecificBuildOptions.certificateSha1 || "no certificateSha1")
      hash.update(this.platformSpecificBuildOptions.certificateSubjectName || "no subjectName")

      buildCacheManager = new BuildCacheManager(outDir, file, arch)
      if (await buildCacheManager.copyIfValid(await digest(hash, files))) {
        timer.end()
        return
      }
      timer.end()
    }

    const timer = time("wine&sign")
    // rcedit crashed of executed using wine, resourcehacker works
    if (process.platform === "win32" || this.info.framework.name === "electron") {
      await executeAppBuilder(["rcedit", "--args", JSON.stringify(args)])
    }

    await this.sign(file)
    timer.end()

    if (buildCacheManager != null) {
      await buildCacheManager.save()
    }
  }

  private isSignDlls(): boolean {
    return this.platformSpecificBuildOptions.signDlls === true
  }

  protected createTransformerForExtraFiles(packContext: AfterPackContext): FileTransformer | null {
    if (this.platformSpecificBuildOptions.signAndEditExecutable === false) {
      return null
    }

    return file => {
      if (file.endsWith(".exe") || (this.isSignDlls() && file.endsWith(".dll"))) {
        const parentDir = path.dirname(file)
        if (parentDir !== packContext.appOutDir) {
          return new CopyFileTransformer(file => this.sign(file))
        }
      }
      return null
    }
  }

  protected async signApp(packContext: AfterPackContext, isAsar: boolean): Promise<any> {
    const exeFileName = `${this.appInfo.productFilename}.exe`
    if (this.platformSpecificBuildOptions.signAndEditExecutable === false) {
      return
    }

    await BluebirdPromise.map(readdir(packContext.appOutDir), (file: string): any => {
      if (file === exeFileName) {
        return this.signAndEditResources(path.join(packContext.appOutDir, exeFileName), packContext.arch, packContext.outDir, path.basename(exeFileName, ".exe"), this.platformSpecificBuildOptions.requestedExecutionLevel)
      }
      else if (file.endsWith(".exe") || (this.isSignDlls() && file.endsWith(".dll"))) {
        return this.sign(path.join(packContext.appOutDir, file))
      }
      return null
    })

    if (!isAsar) {
      return
    }

    const outResourcesDir = path.join(packContext.appOutDir, "resources", "app.asar.unpacked")
    // noinspection JSUnusedLocalSymbols
    const fileToSign = await walk(outResourcesDir, (file, stat) => stat.isDirectory() || file.endsWith(".exe") || file.endsWith(".dll"))
    await BluebirdPromise.map(fileToSign, file => this.sign(file), {concurrency: 4})
  }
}