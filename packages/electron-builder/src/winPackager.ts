import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import _debug from "debug"
import { parseDn } from "electron-builder-http/out/rfc2253Parser"
import { Arch, asArray, exec, execWine, Lazy, log, use, warn } from "electron-builder-util"
import { close, open, read, rename } from "fs-extra-p"
import isCI from "is-ci"
import * as path from "path"
import { downloadCertificate } from "./codeSign"
import { DIR_TARGET, Platform, Target } from "./core"
import { AfterPackContext } from "./metadata"
import { WinBuildOptions } from "./options/winOptions"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import AppXTarget from "./targets/appx"
import { NsisTarget } from "./targets/nsis"
import { AppPackageHelper } from "./targets/nsis/nsisUtil"
import { WebInstallerTarget } from "./targets/nsis/WebInstallerTarget"
import { createCommonTarget } from "./targets/targetFactory"
import { BuildCacheManager, digest } from "./util/cacheManager"
import { isBuildCacheEnabled } from "./util/flags"
import { time } from "./util/timer"
import { FileCodeSigningInfo, getSignVendorPath, sign, SignOptions } from "./windowsCodeSign"

export class WinPackager extends PlatformPackager<WinBuildOptions> {
  readonly cscInfo = new Lazy<FileCodeSigningInfo | null>(() => {
    const platformSpecificBuildOptions = this.platformSpecificBuildOptions
    const subjectName = platformSpecificBuildOptions.certificateSubjectName
    if (subjectName != null) {
      return BluebirdPromise.resolve({subjectName})
    }

    const certificateSha1 = platformSpecificBuildOptions.certificateSha1
    if (certificateSha1 != null) {
      return BluebirdPromise.resolve({certificateSha1})
    }

    const certificateFile = platformSpecificBuildOptions.certificateFile
    if (certificateFile != null) {
      const certificatePassword = this.getCscPassword()
      return BluebirdPromise.resolve({
        file: certificateFile,
        password: certificatePassword == null ? null : certificatePassword.trim(),
      })
    }
    else {
      const cscLink = process.env.WIN_CSC_LINK || this.packagerOptions.cscLink
      if (cscLink != null) {
        return downloadCertificate(cscLink, this.info.tempDirManager, this.projectDir)
          .then(path => {
            return {
              file: path,
              password: this.getCscPassword(),
            }
          })
      }
      else {
        return BluebirdPromise.resolve(null)
      }
    }
  })

  private _iconPath = new Lazy<string | null>(() => this.getValidIconPath())

  readonly computedPublisherSubjectOnWindowsOnly = new Lazy<string | null>(async () => {
    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      return null
    }

    // https://github.com/electron-userland/electron-builder/issues/1735
    const args = cscInfo.password ? [`(Get-PfxData "${cscInfo.file!}" -Password (ConvertTo-SecureString -String "${cscInfo.password}" -Force -AsPlainText)).EndEntityCertificates.Subject`] : [`(Get-PfxCertificate "${cscInfo.file!}").Subject`]
    return await exec("powershell.exe", args, {timeout: 30 * 1000}).then(it => it.trim())
  })

  readonly computedPublisherName = new Lazy<Array<string> | null>(async () => {
    let publisherName = (this.platformSpecificBuildOptions as WinBuildOptions).publisherName
    if (publisherName === null) {
      return null
    }

    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      return null
    }

    const cscFile = cscInfo.file
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
        publisherName = await extractCommonNameUsingOpenssl(cscInfo.password || "", cscFile)
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
    let helper: AppPackageHelper | null
    const getHelper = () => {
      if (helper == null) {
        helper = new AppPackageHelper()
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
        mapper(name, outDir => new WebInstallerTarget(this, outDir, name, getHelper()))
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
              return require("./targets/appx").default

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
    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      if (this.forceCodeSigning) {
        throw new Error(`App is not signed and "forceCodeSigning" is set to true, please ensure that code signing configuration is correct, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
      }

      return
    }

    const certFile = cscInfo.file

    if (logMessagePrefix == null) {
      logMessagePrefix = `Signing ${path.basename(file)}`
    }
    if (certFile == null) {
      if (cscInfo.subjectName == null) {
        log(`${logMessagePrefix} (certificate SHA1: "${cscInfo.certificateSha1}")`)
      }
      else {
        log(`${logMessagePrefix} (certificate subject name: "${cscInfo.subjectName}")`)
      }
    }
    else {
      log(`${logMessagePrefix} (certificate file: "${certFile}")`)
    }

    await this.doSign({
      path: file,

      cert: certFile,

      password: cscInfo.password,
      name: this.appInfo.productName,
      site: await this.appInfo.computePackageUrl(),
      options: {
        ...this.platformSpecificBuildOptions,
        certificateSubjectName: cscInfo.subjectName,
        certificateSha1: cscInfo.certificateSha1
      },
    })
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(options: SignOptions) {
    for (let i = 0; i < 3; i++) {
      try {
        await sign(options)
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

  async signAndEditResources(file: string, arch: Arch, outDir: string, internalName?: string | null) {
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
      if (cscInfoForCacheDigest.file != null) {
        files.push(cscInfoForCacheDigest.file)
      }

      const timer = time("executable cache")
      // md5 is faster, we don't need secure hash
      const hash = createHash("md5")
      hash.update(config.electronVersion || "no electronVersion")
      hash.update(config.muonVersion || "no muonVersion")
      hash.update(JSON.stringify(this.platformSpecificBuildOptions))
      hash.update(JSON.stringify(args))
      hash.update(cscInfoForCacheDigest.certificateSha1 || "no certificateSha1")
      hash.update(cscInfoForCacheDigest.subjectName || "no subjectName")

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
    return this.signAndEditResources(path.join(packContext.appOutDir, exeFileName), packContext.arch, packContext.outDir, path.basename(exeFileName, ".exe"))
  }
}

async function checkIcon(file: string): Promise<void> {
  const fd = await open(file, "r")
  const buffer = new Buffer(512)
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
  const result = await exec("openssl", ["pkcs12", "-nokeys", "-nodes", "-passin", `pass:${password}`, "-nomacver", "-clcerts", "-in", certPath], {timeout: 30 * 1000, maxBuffer: 2 * 1024 * 1024}, debugOpenssl.enabled)
  const match = result.match(/^subject.*\/CN=([^\/]+)$/m)
  if (match == null || match[1] == null) {
    throw new Error("Cannot extract common name from p12: " + result)
  }
  else {
    return match[1]
  }
}