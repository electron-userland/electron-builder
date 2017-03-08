import BluebirdPromise from "bluebird-lst"
import { DIR_TARGET, Platform, Target } from "electron-builder-core"
import { asArray, exec, Lazy, use } from "electron-builder-util"
import { log } from "electron-builder-util/out/log"
import { close, open, read, readFile, rename } from "fs-extra-p"
import * as forge from "node-forge"
import * as path from "path"
import { downloadCertificate } from "./codeSign"
import { WinBuildOptions } from "./options/winOptions"
import { BuildInfo } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import AppXTarget from "./targets/appx"
import NsisTarget from "./targets/nsis"
import { createCommonTarget } from "./targets/targetFactory"
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
        return downloadCertificate(cscLink, this.info.tempDirManager)
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

  private iconPath: Promise<string> | null

  readonly computedPublisherName = new Lazy<Array<string> | null>(async () => {
    let publisherName = (<WinBuildOptions>this.platformSpecificBuildOptions).publisherName
    if (publisherName === null) {
      return null
    }

    const cscInfo = await this.cscInfo.value
    if (cscInfo == null) {
      return null
    }

    if (publisherName == null && cscInfo.file != null) {
      try {
        // https://github.com/digitalbazaar/forge/issues/338#issuecomment-164831585
        const p12Asn1 = forge.asn1.fromDer(await readFile(cscInfo.file, "binary"), false)
        const p12 = (<any>forge).pkcs12.pkcs12FromAsn1(p12Asn1, false, cscInfo.password)
        const bagType = (<any>forge.pki.oids).certBag
        publisherName = p12.getBags({bagType: bagType})[bagType][0].cert.subject.getField("CN").value
      }
      catch (e) {
        throw new Error(`Cannot extract publisher name from code signing certificate, please file issue. As workaround, set win.publisherName: ${e.stack || e}`)
      }
    }

    return publisherName == null ? null : asArray(publisherName)
  })

  constructor(info: BuildInfo) {
    super(info)
  }

  get defaultTarget(): Array<string> {
    return ["nsis"]
  }

  protected doGetCscPassword(): string {
    return this.platformSpecificBuildOptions.certificatePassword || process.env.WIN_CSC_KEY_PASSWORD || super.doGetCscPassword()
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    for (const name of targets) {
      if (name === DIR_TARGET) {
        continue
      }

      const targetClass: typeof NsisTarget | typeof AppXTarget | null = (() => {
        switch (name) {
          case "nsis":
          case "portable":
            return require("./targets/nsis").default
          case "nsis-web":
            return require("./targets/WebInstaller").default

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

      mapper(name, outDir => targetClass === null ? createCommonTarget(name, outDir, this) : new (<any>targetClass)(this, outDir, name))
    }
  }

  get platform() {
    return Platform.WINDOWS
  }

  getIconPath() {
    if (this.iconPath == null) {
      this.iconPath = this.getValidIconPath()
    }
    return this.iconPath
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
      options: Object.assign({}, this.platformSpecificBuildOptions, {
        certificateSubjectName: cscInfo.subjectName,
        certificateSha1: cscInfo.certificateSha1,
      }),
    })
  }

  //noinspection JSMethodCanBeStatic
  protected doSign(options: SignOptions): Promise<any> {
    return sign(options)
  }

  async signAndEditResources(file: string) {
    const appInfo = this.appInfo

    const args = [
      file,
      "--set-version-string", "CompanyName", appInfo.companyName,
      "--set-version-string", "FileDescription", appInfo.productName,
      "--set-version-string", "ProductName", appInfo.productName,
      "--set-version-string", "InternalName", path.basename(appInfo.productFilename, ".exe"),
      "--set-version-string", "LegalCopyright", appInfo.copyright,
      "--set-version-string", "OriginalFilename", "",
      "--set-file-version", appInfo.buildVersion,
      "--set-product-version", appInfo.versionInWeirdWindowsForm,
    ]

    use(this.platformSpecificBuildOptions.legalTrademarks, it => args.push("--set-version-string", "LegalTrademarks", it!))
    use(await this.getIconPath(), it => args.push("--set-icon", it))

    const rceditExecutable = path.join(await getSignVendorPath(), "rcedit.exe")
    const isWin = process.platform === "win32"
    if (!isWin) {
      args.unshift(rceditExecutable)
    }
    await exec(isWin ? rceditExecutable : "wine", args)

    await this.sign(file)
  }

  protected async postInitApp(appOutDir: string) {
    const executable = path.join(appOutDir, `${this.appInfo.productFilename}.exe`)
    await rename(path.join(appOutDir, "electron.exe"), executable)
    await this.signAndEditResources(executable)
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