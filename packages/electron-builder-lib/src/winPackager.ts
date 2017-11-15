import BluebirdPromise from "bluebird-lst"
import { Arch, asArray, exec, execWine, log, use, warn } from "builder-util"
import { parseDn } from "builder-util-runtime"
import { createHash } from "crypto"
import _debug from "debug"
import { close, open, read, rename } from "fs-extra-p"
import isCI from "is-ci"
import { Lazy } from "lazy-val"
import * as path from "path"
import { downloadCertificate } from "./codeSign"
import { AfterPackContext } from "./configuration"
import { DIR_TARGET, Platform, Target } from "./core"
import { RequestedExecutionLevel, WindowsConfiguration } from "./options/winOptions"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import AppXTarget from "./targets/AppxTarget"
import { NsisTarget } from "./targets/nsis/NsisTarget"
import { AppPackageHelper, CopyElevateHelper } from "./targets/nsis/nsisUtil"
import { WebInstallerTarget } from "./targets/nsis/WebInstallerTarget"
import { createCommonTarget } from "./targets/targetFactory"
import { BuildCacheManager, digest } from "./util/cacheManager"
import { isBuildCacheEnabled } from "./util/flags"
import { time } from "./util/timer"
import { CertificateFromStoreInfo, FileCodeSigningInfo, getCertificateFromStoreInfo, getSignVendorPath, sign, WindowsSignOptions } from "./windowsCodeSign"
import { VmManager, getWindowsVm } from "./vm/vm"

export class WinPackager extends PlatformPackager<WindowsConfiguration> {
  readonly cscInfo = new Lazy<FileCodeSigningInfo | CertificateFromStoreInfo | null>(() => {
    const platformSpecificBuildOptions = this.platformSpecificBuildOptions
    if (platformSpecificBuildOptions.certificateSubjectName != null || platformSpecificBuildOptions.certificateSha1 != null) {
      if (platformSpecificBuildOptions.sign != null) {
        return BluebirdPromise.resolve(null)
      }
      return this.vm.value.then(vm => getCertificateFromStoreInfo(platformSpecificBuildOptions, vm))
    }

    const certificateFile = platformSpecificBuildOptions.certificateFile
    if (certificateFile != null) {
      const certificatePassword = this.getCscPassword()
      return BluebirdPromise.resolve({
        file: certificateFile,
        password: certificatePassword == null ? null : certificatePassword.trim(),
      })
    }

    const cscLink = process.env.WIN_CSC_LINK || this.packagerOptions.cscLink
    if (cscLink == null) {
      return BluebirdPromise.resolve(null)
    }

    return downloadCertificate(cscLink, this.info.tempDirManager, this.projectDir)
      .then(path => {
        return {
          file: path!!,
          password: this.getCscPassword(),
        }
      })
  })

  private _iconPath = new Lazy<string | null>(() => this.getValidIconPath())

  readonly vm = new Lazy<VmManager>(() => process.platform === "win32" ? BluebirdPromise.resolve(new VmManager()) : getWindowsVm(this.debugLogger))

  readonly computedPublisherSubjectOnWindowsOnly = new Lazy<string | null>(async () => {
    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      return null
    }

    if ("subject" in cscInfo) {
      return (cscInfo as CertificateFromStoreInfo).subject
    }

    const vm = await this.vm.value
    const info = cscInfo as FileCodeSigningInfo
    const certFile = vm.toVmFile(info.file)
    // https://github.com/electron-userland/electron-builder/issues/1735
    const args = info.password ? [`(Get-PfxData "${certFile}" -Password (ConvertTo-SecureString -String "${info.password}" -Force -AsPlainText)).EndEntityCertificates.Subject`] : [`(Get-PfxCertificate "${certFile}").Subject`]
    return await vm.exec("powershell.exe", args, {timeout: 30 * 1000}).then(it => it.trim())
  })

  readonly computedPublisherName = new Lazy<Array<string> | null>(async () => {
    let publisherName = (this.platformSpecificBuildOptions as WindowsConfiguration).publisherName
    if (publisherName === null) {
      return null
    }

    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      return null
    }

    if ("subject" in cscInfo) {
      return asArray(parseDn((cscInfo as CertificateFromStoreInfo).subject).get("CN"))
    }

    const cscFile = (cscInfo as FileCodeSigningInfo).file
    if (publisherName == null && cscFile != null) {
      if (process.platform === "win32") {
        try {
          const subject = await this.computedPublisherSubjectOnWindowsOnly.value
          const commonName = subject == null ? null : parseDn(subject).get("CN")
          if (commonName) {
            return asArray(commonName)
          }
        }
        catch (e) {
          warn(`Cannot get publisher name using powershell: ${e.message}`)
        }
      }

      try {
        publisherName = await extractCommonNameUsingOpenssl((cscInfo as FileCodeSigningInfo).password || "", cscFile)
      }
      catch (e) {
        throw new Error(`Cannot extract publisher name from code signing certificate, please file issue. As workaround, set win.publisherName: ${e.stack || e}`)
      }
    }

    return publisherName == null ? null : asArray(publisherName)
  })

  get isForceCodeSigningVerification(): boolean {
    return this.platformSpecificBuildOptions.verifyUpdateCodeSignature !== false
  }

  constructor(info: Packager) {
    super(info)
  }

  get defaultTarget(): Array<string> {
    return ["nsis"]
  }

  protected doGetCscPassword(): string | undefined {
    return this.platformSpecificBuildOptions.certificatePassword || process.env.WIN_CSC_KEY_PASSWORD || super.doGetCscPassword()
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
                throw new Error(`Module electron-builder-squirrel-windows must be installed in addition to build Squirrel.Windows: ${e.stack || e}`)
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

  get platform() {
    return Platform.WINDOWS
  }

  getIconPath() {
    return this._iconPath.value
  }

  private async getValidIconPath(): Promise<string | null> {
    let iconPath = this.platformSpecificBuildOptions.icon || this.config.icon
    if (iconPath != null && !iconPath.endsWith(".ico")) {
      iconPath += ".ico"
    }

    iconPath = iconPath == null ? await this.getDefaultIcon("ico") : path.resolve(this.projectDir, iconPath)
    if (iconPath == null) {
      return null
    }

    await checkIcon(iconPath)
    return iconPath
  }

  async sign(file: string, logMessagePrefix?: string) {
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
        throw new Error(`App is not signed and "forceCodeSigning" is set to true, please ensure that code signing configuration is correct, please see https://electron.build/code-signing`)
      }
      return
    }

    if (logMessagePrefix == null) {
      logMessagePrefix = `Signing ${path.basename(file)}`
    }

    if ("file" in cscInfo) {
      log(`${logMessagePrefix} (certificate file: "${(cscInfo as FileCodeSigningInfo).file}")`)
    }
    else {
      const info = cscInfo as CertificateFromStoreInfo
      log(`${logMessagePrefix} (subject: "${info.subject}", thumbprint: "${info.thumbprint}", store: ${info.store} (${info.isLocalMachineStore ? "local machine" : "current user"}))`)
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
          warn(`Cannot sign, attempt ${i + 1}: ${message}`)
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
      "--set-product-version", appInfo.versionInWeirdWindowsForm,
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
      hash.update(config.muonVersion || "no muonVersion")
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
    await execWine(path.join(await getSignVendorPath(), "rcedit.exe"), args)
    await this.sign(file)
    timer.end()

    if (buildCacheManager != null) {
      await buildCacheManager.save()
    }
  }

  protected async postInitApp(packContext: AfterPackContext) {
    const executable = path.join(packContext.appOutDir, `${this.appInfo.productFilename}.exe`)
    await rename(path.join(packContext.appOutDir, `${this.electronDistExecutableName}.exe`), executable)
  }

  protected signApp(packContext: AfterPackContext): Promise<any> {
    const exeFileName = `${this.appInfo.productFilename}.exe`
    return this.signAndEditResources(path.join(packContext.appOutDir, exeFileName), packContext.arch, packContext.outDir, path.basename(exeFileName, ".exe"), this.platformSpecificBuildOptions.requestedExecutionLevel)
  }
}

async function checkIcon(file: string): Promise<void> {
  const fd = await open(file, "r")
  const buffer = Buffer.allocUnsafe(512)
  try {
    await read(fd, buffer, 0, buffer.length, 0)
  }
  finally {
    await close(fd)
  }

  if (!isIco(buffer)) {
    throw new Error(`Windows icon is not valid ico file, please fix "${file}"`)
  }

  const sizes = parseIco(buffer)
  for (const size of sizes) {
    if (size!.w >= 256 && size!.h >= 256) {
      return
    }
  }

  throw new Error(`Windows icon size must be at least 256x256, please fix "${file}"`)
}

interface Size {
  w: number
  h: number
}

function parseIco(buffer: Buffer): Array<Size> {
  if (!isIco(buffer)) {
    throw new Error("buffer is not ico")
  }

  const n = buffer.readUInt16LE(4)
  const result = new Array<Size>(n)
  for (let i = 0; i < n; i++) {
    result[i] = {
      w: buffer.readUInt8(6 + i * 16) || 256,
      h: buffer.readUInt8(7 + i * 16) || 256,
    }
  }
  return result
}

function isIco(buffer: Buffer): boolean {
  return buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1
}

const debugOpenssl = _debug("electron-builder:openssl")
async function extractCommonNameUsingOpenssl(password: string, certPath: string): Promise<string> {
  const result = await exec("openssl", ["pkcs12", "-nokeys", "-nodes", "-passin", `pass:${password}`, "-nomacver", "-clcerts", "-in", certPath], {timeout: 30 * 1000}, debugOpenssl.enabled)
  const match = result.match(/^subject.*\/CN=([^\/\n]+)/m)
  if (match == null || match[1] == null) {
    throw new Error(`Cannot extract common name from p12: ${result}`)
  }
  else {
    return match[1]
  }
}