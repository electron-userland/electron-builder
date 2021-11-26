import { Arch, log } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import { getBinFromUrl, getBinFromCustomLoc } from "../../binDownload"
import { copyFile } from "builder-util/out/fs"
import * as path from "path"
import { getTemplatePath } from "../../util/pathManager"
import { NsisTarget } from "./NsisTarget"
import * as fs from "fs/promises"
import * as zlib from "zlib"
import { NsisOptions } from "./nsisOptions"

export const nsisTemplatesDir = getTemplatePath("nsis")

export const NsisTargetOptions = (() => {
  let _resolve: (options: NsisOptions) => any
  const promise = new Promise<NsisOptions>(resolve => (_resolve = resolve))
  return {
    then: (callback: (options: NsisOptions) => any): Promise<string> => promise.then(callback),
    resolve: (options: NsisOptions): any => _resolve(options),
  }
})()

export const NSIS_PATH = () => {
  const custom = process.env.ELECTRON_BUILDER_NSIS_DIR
  if (custom != null && custom.length > 0) {
    return Promise.resolve(custom.trim())
  }
  return NsisTargetOptions.then((options: NsisOptions) => {
    if (options.customNsisBinary) {
      const { checksum, url, version } = options.customNsisBinary
      if (checksum && url) {
        const binaryVersion = version || checksum.substr(0, 8)
        return getBinFromCustomLoc("nsis", binaryVersion, url, checksum)
      }
    }
    // Warning: Don't use v3.0.4.2 - https://github.com/electron-userland/electron-builder/issues/6334
    // noinspection SpellCheckingInspection
    return getBinFromUrl("nsis", "3.0.4.1", "VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q==")
  })
}

export class AppPackageHelper {
  private readonly archToFileInfo = new Map<Arch, Promise<PackageFileInfo>>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  constructor(private readonly elevateHelper: CopyElevateHelper) {}

  async packArch(arch: Arch, target: NsisTarget): Promise<PackageFileInfo> {
    let infoPromise = this.archToFileInfo.get(arch)
    if (infoPromise == null) {
      const appOutDir = target.archs.get(arch)!
      infoPromise = this.elevateHelper.copy(appOutDir, target).then(() => target.buildAppPackage(appOutDir, arch))
      this.archToFileInfo.set(arch, infoPromise)
    }

    const info = await infoPromise
    if (target.isWebInstaller) {
      this.infoToIsDelete.set(info, false)
    } else if (!this.infoToIsDelete.has(info)) {
      this.infoToIsDelete.set(info, true)
    }
    return info
  }

  async finishBuild(): Promise<any> {
    if (--this.refCount > 0) {
      return
    }

    const filesToDelete: Array<string> = []
    for (const [info, isDelete] of this.infoToIsDelete.entries()) {
      if (isDelete) {
        filesToDelete.push(info.path)
      }
    }

    await Promise.all(filesToDelete.map(it => fs.unlink(it)))
  }
}

export class CopyElevateHelper {
  private readonly copied = new Map<string, Promise<any>>()

  copy(appOutDir: string, target: NsisTarget): Promise<any> {
    if (!target.packager.info.framework.isCopyElevateHelper) {
      return Promise.resolve()
    }

    let isPackElevateHelper = target.options.packElevateHelper
    if (isPackElevateHelper === false && target.options.perMachine === true) {
      isPackElevateHelper = true
      log.warn("`packElevateHelper = false` is ignored, because `perMachine` is set to `true`")
    }

    if (isPackElevateHelper === false) {
      return Promise.resolve()
    }

    let promise = this.copied.get(appOutDir)
    if (promise != null) {
      return promise
    }

    promise = NSIS_PATH().then(it => {
      const outFile = path.join(appOutDir, "resources", "elevate.exe")
      const promise = copyFile(path.join(it, "elevate.exe"), outFile, false)
      if (target.packager.platformSpecificBuildOptions.signAndEditExecutable !== false) {
        return promise.then(() => target.packager.sign(outFile))
      }
      return promise
    })
    this.copied.set(appOutDir, promise)
    return promise
  }
}

class BinaryReader {
  private readonly _buffer: Buffer
  private _position: number

  constructor(buffer: Buffer) {
    this._buffer = buffer
    this._position = 0
  }

  get length(): number {
    return this._buffer.length
  }

  get position(): number {
    return this._position
  }

  match(signature: Array<number>): boolean {
    if (signature.every((v, i) => this._buffer[this._position + i] === v)) {
      this._position += signature.length
      return true
    }
    return false
  }

  skip(offset: number) {
    this._position += offset
  }

  bytes(size: number): Buffer {
    const value = this._buffer.subarray(this._position, this._position + size)
    this._position += size
    return value
  }

  uint16(): number {
    const value = this._buffer[this._position] | (this._buffer[this._position + 1] << 8)
    this._position += 2
    return value
  }

  uint32(): number {
    return this.uint16() | (this.uint16() << 16)
  }

  string(length: number): string {
    let value = ""
    for (let i = 0; i < length; i++) {
      const c = this._buffer[this._position + i]
      if (c === 0x00) {
        break
      }
      value += String.fromCharCode(c)
    }
    this._position += length
    return value
  }
}

export class UninstallerReader {
  // noinspection SpellCheckingInspection
  static async exec(installerPath: string, uninstallerPath: string) {
    const buffer = await fs.readFile(installerPath)
    const reader = new BinaryReader(buffer)
    // IMAGE_DOS_HEADER
    if (!reader.match([0x4d, 0x5a])) {
      throw new Error("Invalid 'MZ' signature.")
    }
    reader.skip(58)
    // e_lfanew
    reader.skip(reader.uint32() - reader.position)
    // IMAGE_FILE_HEADER
    if (!reader.match([0x50, 0x45, 0x00, 0x00])) {
      throw new Error("Invalid 'PE' signature.")
    }
    reader.skip(2)
    const numberOfSections = reader.uint16()
    reader.skip(12)
    const sizeOfOptionalHeader = reader.uint16()
    reader.skip(2)
    reader.skip(sizeOfOptionalHeader)
    // IMAGE_SECTION_HEADER
    let nsisOffset = 0
    for (let i = 0; i < numberOfSections; i++) {
      const name = reader.string(8)
      reader.skip(8)
      const rawSize = reader.uint32()
      const rawPointer = reader.uint32()
      reader.skip(16)
      switch (name) {
        case ".text":
        case ".rdata":
        case ".data":
        case ".rsrc": {
          nsisOffset = Math.max(rawPointer + rawSize, nsisOffset)
          break
        }
        default: {
          if (rawPointer !== 0 && rawSize !== 0) {
            throw new Error("Unsupported section '" + name + "'.")
          }
          break
        }
      }
    }
    const executable = buffer.subarray(0, nsisOffset)
    const nsisSize = buffer.length - nsisOffset
    const nsisReader = new BinaryReader(buffer.subarray(nsisOffset, nsisOffset + nsisSize))
    const nsisSignature = [0xef, 0xbe, 0xad, 0xde, 0x4e, 0x75, 0x6c, 0x6c, 0x73, 0x6f, 0x66, 0x74, 0x49, 0x6e, 0x73, 0x74]
    nsisReader.uint32() // ?
    if (!nsisReader.match(nsisSignature)) {
      throw new Error("Invalid signature.")
    }
    nsisReader.uint32() // ?
    if (nsisSize !== nsisReader.uint32()) {
      throw new Error("Size mismatch.")
    }

    let innerBuffer = null
    while (true) {
      let size = nsisReader.uint32()
      const compressed = (size & 0x80000000) !== 0
      size = size & 0x7fffffff
      if (size === 0 || nsisReader.position + size > nsisReader.length || nsisReader.position >= nsisReader.length) {
        break
      }
      let buffer = nsisReader.bytes(size)
      if (compressed) {
        buffer = zlib.inflateRawSync(buffer)
      }
      const innerReader = new BinaryReader(buffer)
      innerReader.uint32() // ?
      if (innerReader.match(nsisSignature)) {
        if (innerBuffer) {
          throw new Error("Multiple inner blocks.")
        }
        innerBuffer = buffer
      }
    }
    if (!innerBuffer) {
      throw new Error("Inner block not found.")
    }
    await fs.writeFile(uninstallerPath, executable)
    await fs.appendFile(uninstallerPath, innerBuffer)
  }
}
