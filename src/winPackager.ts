import { downloadCertificate } from "./codeSign"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo, smarten, getArchSuffix } from "./platformPackager"
import { Platform, WinBuildOptions, Arch } from "./metadata"
import * as path from "path"
import { log, warn } from "./util"
import { deleteFile, emptyDir, open, close, read } from "fs-extra-p"
import { sign, SignOptions } from "signcode-tf"
import { ElectronPackagerOptions } from "electron-packager-tf"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

interface FileCodeSigningInfo {
  readonly file: string
  readonly password?: string | null
}

export class WinPackager extends PlatformPackager<WinBuildOptions> {
  private readonly cscInfo: Promise<FileCodeSigningInfo | null>

  private readonly iconPath: Promise<string>

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info)

    const certificateFile = this.customBuildOptions.certificateFile
    if (certificateFile != null) {
      const certificatePassword = this.customBuildOptions.certificatePassword || this.getCscPassword()
      this.cscInfo = BluebirdPromise.resolve({
        file: certificateFile,
        password: certificatePassword == null ? null : certificatePassword.trim(),
      })
    }
    else if (this.options.cscLink != null) {
      this.cscInfo = downloadCertificate(this.options.cscLink)
        .then(path => {
          cleanupTasks.push(() => deleteFile(path, true))
          return {
            file: path,
            password: this.getCscPassword(),
          }
        })
    }
    else {
      this.cscInfo = BluebirdPromise.resolve(null)
    }

    this.iconPath = this.getValidIconPath()
  }

  get platform() {
    return Platform.WINDOWS
  }

  protected get supportedTargets(): Array<string> {
    return []
  }

  private async getValidIconPath(): Promise<string> {
    const iconPath = path.join(this.buildResourcesDir, "icon.ico")
    await checkIcon(iconPath)
    return iconPath
  }

  async pack(outDir: string, arch: Arch, targets: Array<string>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    if (arch === Arch.ia32) {
      warn("For windows consider only distributing 64-bit, see https://github.com/electron-userland/electron-builder/issues/359#issuecomment-214851130")
    }

    // we must check icon before pack because electron-packager uses icon and it leads to cryptic error message "spawn wine ENOENT"
    await this.iconPath

    const appOutDir = this.computeAppOutDir(outDir, arch)
    const packOptions = this.computePackOptions(outDir, appOutDir, arch)

    if (!targets.includes("default")) {
      await this.doPack(packOptions, outDir, appOutDir, arch, this.customBuildOptions)
      return
    }

    const installerOut = computeDistOut(outDir, arch)
    await BluebirdPromise.all([
      this.doPack(packOptions, outDir, appOutDir, arch, this.customBuildOptions),
      emptyDir(installerOut)
    ])

    postAsyncTasks.push(this.packageInDistributableFormat(appOutDir, installerOut, arch, packOptions))
  }

  protected computeAppOutDir(outDir: string, arch: Arch): string {
    return path.join(outDir, `win${getArchSuffix(arch)}-unpacked`)
  }

  protected async doPack(options: ElectronPackagerOptions, outDir: string, appOutDir: string, arch: Arch, customBuildOptions: WinBuildOptions) {
    await super.doPack(options, outDir, appOutDir, arch, customBuildOptions)
    await this.sign(appOutDir)
  }

  protected async sign(appOutDir: string) {
    const cscInfo = await this.cscInfo
    if (cscInfo != null) {
      const filename = `${this.appName}.exe`
      log(`Signing ${filename} (certificate file "${cscInfo.file}")`)
      await this.doSign({
        path: path.join(appOutDir, filename),
        cert: cscInfo.file,
        password: cscInfo.password!,
        name: this.appName,
        site: await this.computePackageUrl(),
        overwrite: true,
        hash: this.customBuildOptions.signingHashAlgorithms,
      })
    }
  }

  protected async doSign(opts: SignOptions): Promise<any> {
    return BluebirdPromise.promisify(sign)(opts)
  }

  protected async computeEffectiveDistOptions(appOutDir: string, installerOutDir: string, packOptions: ElectronPackagerOptions, setupExeName: string): Promise<WinBuildOptions> {
    let iconUrl = this.customBuildOptions.iconUrl || this.devMetadata.build.iconUrl
    if (iconUrl == null) {
      if (this.info.repositoryInfo != null) {
        const info = await this.info.repositoryInfo.getInfo(this)
        if (info != null) {
          iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${this.relativeBuildResourcesDirname}/icon.ico?raw=true`
        }
      }

      if (iconUrl == null) {
        throw new Error("iconUrl is not specified, please see https://github.com/electron-userland/electron-builder/wiki/Options#WinBuildOptions-iconUrl")
      }
    }

    checkConflictingOptions(this.customBuildOptions)

    const projectUrl = await this.computePackageUrl()
    const rceditOptions = {
      "version-string": packOptions["version-string"],
      "file-version": packOptions["build-version"],
      "product-version": packOptions["app-version"],
    }
    rceditOptions["version-string"]!.LegalCopyright = packOptions["app-copyright"]

    const cscInfo = await this.cscInfo
    const options: any = Object.assign({
      name: this.metadata.name,
      productName: this.appName,
      exe: this.appName + ".exe",
      setupExe: setupExeName,
      title: this.appName,
      appDirectory: appOutDir,
      outputDirectory: installerOutDir,
      version: this.metadata.version,
      description: smarten(this.metadata.description),
      authors: this.metadata.author.name,
      iconUrl: iconUrl,
      setupIcon: await this.iconPath,
      certificateFile: cscInfo == null ? null : cscInfo.file,
      certificatePassword: cscInfo == null ? null : cscInfo.password,
      fixUpPaths: false,
      skipUpdateIcon: true,
      usePackageJson: false,
      extraMetadataSpecs: projectUrl == null ? null : `\n    <projectUrl>${projectUrl}</projectUrl>`,
      copyright: packOptions["app-copyright"],
      packageCompressionLevel: this.devMetadata.build.compression === "store" ? 0 : 9,
      sign: {
        name: this.appName,
        site: projectUrl,
        overwrite: true,
        hash: this.customBuildOptions.signingHashAlgorithms,
      },
      rcedit: rceditOptions,
    }, this.customBuildOptions)

    if (!("loadingGif" in options)) {
      const resourceList = await this.resourceList
      if (resourceList.includes("install-spinner.gif")) {
        options.loadingGif = path.join(this.buildResourcesDir, "install-spinner.gif")
      }
    }

    return options
  }

  protected async packageInDistributableFormat(appOutDir: string, installerOutDir: string, arch: Arch, packOptions: ElectronPackagerOptions): Promise<any> {
    const winstaller = require("electron-winstaller-fixed")
    const version = this.metadata.version
    const archSuffix = getArchSuffix(arch)
    const setupExeName = `${this.appName} Setup ${version}${archSuffix}.exe`

    const distOptions = await this.computeEffectiveDistOptions(appOutDir, installerOutDir, packOptions, setupExeName)
    await winstaller.createWindowsInstaller(distOptions)
    this.dispatchArtifactCreated(path.join(installerOutDir, setupExeName), `${this.metadata.name}-Setup-${version}${archSuffix}.exe`)

    const packagePrefix = `${this.metadata.name}-${winstaller.convertVersion(version)}-`
    this.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}full.nupkg`))
    if (distOptions.remoteReleases != null) {
      this.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}delta.nupkg`))
    }

    this.dispatchArtifactCreated(path.join(installerOutDir, "RELEASES"))
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

export function computeDistOut(outDir: string, arch: Arch): string {
  return path.join(outDir, `win${getArchSuffix(arch)}`)
}

function checkConflictingOptions(options: any) {
  for (let name of ["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"]) {
    if (name in options) {
      throw new Error(`Option ${name} is ignored, do not specify it.`)
    }
  }

  if ("noMsi" in options) {
    warn(`noMsi is deprecated, please specify as "msi": true if you want to create an MSI installer`)
    options.msi = !options.noMsi
  }

  const msi = options.msi
  if (msi != null && typeof msi !== "boolean") {
    throw new Error(`msi expected to be boolean value, but string '"${msi}"' was specified`)
  }
}