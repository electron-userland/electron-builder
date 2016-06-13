import { downloadCertificate } from "./codeSign"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo, getArchSuffix } from "./platformPackager"
import { Platform, WinBuildOptions, Arch } from "./metadata"
import * as path from "path"
import { log, warn } from "./util"
import { deleteFile, open, close, read } from "fs-extra-p"
import { sign, SignOptions } from "signcode-tf"
import { ElectronPackagerOptions } from "electron-packager-tf"
import SquirrelWindowsTarget from "./targets/squirrelWindows"
import NsisTarget from "./targets/nsis"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export interface FileCodeSigningInfo {
  readonly file: string
  readonly password?: string | null
}

export class WinPackager extends PlatformPackager<WinBuildOptions> {
  readonly cscInfo: Promise<FileCodeSigningInfo | null>

  readonly iconPath: Promise<string>

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

  get supportedTargets(): Array<string> {
    return ["squirrel", "nsis"]
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

    await this.doPack(packOptions, outDir, appOutDir, arch, this.customBuildOptions)
    await this.sign(path.join(appOutDir, `${this.appName}.exe`))
    this.packageInDistributableFormat(outDir, appOutDir, arch, packOptions, targets, postAsyncTasks)
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

  protected packageInDistributableFormat(outDir: string, appOutDir: string, arch: Arch, packOptions: ElectronPackagerOptions, targets: Array<string>, promises: Array<Promise<any>>): void {
    for (let target of targets) {
      if (target === "squirrel" || target === "default") {
        const helperClass: typeof SquirrelWindowsTarget = require("./targets/squirrelWindows").default
        promises.push(new helperClass(this, appOutDir).build(packOptions, arch))
      }
      else if (target === "nsis") {
        const helperClass: typeof NsisTarget = require("./targets/nsis").default
        promises.push(new helperClass(this, outDir, appOutDir).build(arch))
      }
      else {
        log(`Creating Windows ${target}`)
        // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
        const outFile = path.join(outDir, `${this.appName}-${this.metadata.version}${getArchSuffix(arch)}-win.${target}`)
        promises.push(this.archiveApp(target, appOutDir, outFile)
          .then(() => this.dispatchArtifactCreated(outFile, `${this.metadata.name}-${this.metadata.version}${getArchSuffix(arch)}-win.${target}`)))
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