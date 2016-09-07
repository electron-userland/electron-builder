import { downloadCertificate } from "./codeSign"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo, getArchSuffix, Target } from "./platformPackager"
import { Platform, WinBuildOptions, Arch } from "./metadata"
import * as path from "path"
import { log, task } from "./util/log"
import { exec, use } from "./util/util"
import { open, close, read } from "fs-extra-p"
import { sign, SignOptions, getSignVendorPath } from "./windowsCodeSign"
import SquirrelWindowsTarget from "./targets/squirrelWindows"
import NsisTarget from "./targets/nsis"
import { DEFAULT_TARGET, createCommonTarget, DIR_TARGET } from "./targets/targetFactory"
import { rename } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

export interface FileCodeSigningInfo {
  readonly file?: string | null
  readonly password?: string | null

  readonly subjectName?: string | null
}

export class WinPackager extends PlatformPackager<WinBuildOptions> {
  readonly cscInfo: Promise<FileCodeSigningInfo | null> | null

  private readonly iconPath: Promise<string>

  constructor(info: BuildInfo) {
    super(info)

    const subjectName = this.platformSpecificBuildOptions.certificateSubjectName
    if (subjectName == null) {
      const certificateFile = this.platformSpecificBuildOptions.certificateFile
      const cscLink = this.options.cscLink
      if (certificateFile != null) {
        const certificatePassword = this.platformSpecificBuildOptions.certificatePassword || this.getCscPassword()
        this.cscInfo = BluebirdPromise.resolve({
          file: certificateFile,
          password: certificatePassword == null ? null : certificatePassword.trim(),
        })
      }
      else if (cscLink != null) {
        this.cscInfo = downloadCertificate(cscLink, info.tempDirManager)
          .then(path => {
            return {
              file: path,
              password: this.getCscPassword(),
            }
          })
      }
      else {
        this.cscInfo = BluebirdPromise.resolve(null)
      }
    }
    else {
      this.cscInfo = BluebirdPromise.resolve({
        subjectName: subjectName
      })
    }

    this.iconPath = this.getValidIconPath()
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    for (let name of targets) {
      if (name === DIR_TARGET) {
        continue
      }

      if (name === DEFAULT_TARGET || name === "squirrel") {
        mapper("squirrel", () => {
          const targetClass: typeof SquirrelWindowsTarget = require("./targets/squirrelWindows").default
          return new targetClass(this)
        })
      }
      else if (name === "nsis") {
        mapper(name, outDir => {
          const targetClass: typeof NsisTarget = require("./targets/nsis").default
          return new targetClass(this, outDir)
        })
      }
      else {
        mapper(name, () => createCommonTarget(name))
      }
    }
  }

  get platform() {
    return Platform.WINDOWS
  }

  async getIconPath() {
    return await this.iconPath
  }

  private async getValidIconPath(): Promise<string | null> {
    let iconPath = this.platformSpecificBuildOptions.icon || this.devMetadata.build.icon
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

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions)
    this.packageInDistributableFormat(outDir, appOutDir, arch, targets, postAsyncTasks)
  }

  protected computeAppOutDir(outDir: string, arch: Arch): string {
    return path.join(outDir, `win${getArchSuffix(arch)}-unpacked`)
  }

  async sign(file: string) {
    const cscInfo = await this.cscInfo
    if (cscInfo != null) {
      log(`Signing ${path.basename(file)} (certificate file "${cscInfo.file}")`)
      await this.doSign({
        path: file,

        cert: cscInfo.file,
        subjectName: cscInfo.subjectName,

        password: cscInfo.password,
        name: this.appInfo.productName,
        site: await this.appInfo.computePackageUrl(),
        hash: this.platformSpecificBuildOptions.signingHashAlgorithms,
        tr: this.platformSpecificBuildOptions.rfc3161TimeStampServer,
      })
    }
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(options: SignOptions): Promise<any> {
    return sign(options)
  }

  async signAndEditResources(file: string) {
    const appInfo = this.appInfo

    const args = [
      file,
      "--set-version-string", "CompanyName", appInfo.companyName,
      "--set-version-string", "FileDescription", appInfo.description,
      "--set-version-string", "ProductName", appInfo.productName,
      "--set-version-string", "InternalName", path.basename(appInfo.productFilename, ".exe"),
      "--set-version-string", "LegalCopyright", appInfo.copyright,
      "--set-version-string", "OriginalFilename", "",
      "--set-file-version", appInfo.buildVersion,
      "--set-product-version", appInfo.version,
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

  protected packageInDistributableFormat(outDir: string, appOutDir: string, arch: Arch, targets: Array<Target>, promises: Array<Promise<any>>): void {
    for (let target of targets) {
      if (target instanceof SquirrelWindowsTarget) {
        promises.push(task(`Building Squirrel.Windows installer`, target.build(arch, appOutDir)))
      }
      else if (target instanceof NsisTarget) {
        promises.push(target.build(arch, appOutDir))
      }
      else {
        const format = target.name
        log(`Creating Windows ${format}`)
        // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
        const outFile = path.join(outDir, this.generateName(format, arch, false, "win"))
        promises.push(this.archiveApp(format, appOutDir, outFile)
          .then(() => this.dispatchArtifactCreated(outFile, this.generateName(format, arch, true, "win"))))
      }
    }
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
  for (let size of sizes) {
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