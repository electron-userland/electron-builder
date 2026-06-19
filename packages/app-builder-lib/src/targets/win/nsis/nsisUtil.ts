import { Arch, copyFile, debug7z, dirSize, exec, log } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import * as fs from "fs/promises"
import * as path from "path"
import * as zlib from "zlib"
import { isWindowsSigningDisabled } from "../../../options/winOptions.js"
import { getNsisElevatePath } from "../../../toolsets/nsis.js"
import { getPath7za } from "../../../toolsets/7zip.js"
import { getTemplatePath } from "../../../util/pathManager.js"
import { ArchiveOptions, compute7zCompressArgs } from "../../archive.js"
import { NsisTarget } from "./NsisTarget.js"

export const nsisTemplatesDir = getTemplatePath("nsis")

export interface PackArchResult {
  fileInfo: PackageFileInfo
  unpackedSize: number
}

export class AppPackageHelper {
  private readonly archToResult = new Map<Arch, Promise<PackArchResult>>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  constructor(private readonly elevateHelper: CopyElevateHelper) {}

  async packArch(arch: Arch, target: NsisTarget): Promise<PackArchResult> {
    let resultPromise = this.archToResult.get(arch)
    if (resultPromise == null) {
      const appOutDir = target.archs.get(arch)!
      resultPromise = target.buildAppPackage(appOutDir, arch, this.elevateHelper).then(async fileInfo => ({
        fileInfo,
        unpackedSize: await dirSize(appOutDir),
      }))
      this.archToResult.set(arch, resultPromise)
    }

    const result = await resultPromise
    const { fileInfo: info } = result
    if (target.isWebInstaller) {
      this.infoToIsDelete.set(info, false)
    } else if (!this.infoToIsDelete.has(info)) {
      this.infoToIsDelete.set(info, true)
    }
    return result
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
  // Cached path resolution — shared across all arches since the source never changes per build.
  private elevatePath: Promise<string | null> | null = null

  // appOutDirs whose win-unpacked copy of elevate.exe has already been deferred, so the same
  // directory isn't queued twice when multiple NSIS targets (e.g. nsis + nsis-web) share an arch.
  private readonly stagedUnpackedCopies = new Set<string>()

  private resolve(target: NsisTarget): Promise<string | null> {
    if (!target.packager.framework.isCopyElevateHelper) {
      return Promise.resolve(null)
    }

    let isPackElevateHelper = target.options.packElevateHelper
    if (isPackElevateHelper === false && target.options.perMachine === true) {
      isPackElevateHelper = true
      log.warn("`packElevateHelper = false` is ignored, because `perMachine` is set to `true`")
    }

    if (isPackElevateHelper === false) {
      return Promise.resolve(null)
    }

    if (this.elevatePath == null) {
      this.elevatePath = getNsisElevatePath(target.packager.config.toolsets?.nsis, target.packager.buildResourcesDir)
    }

    return this.elevatePath
  }

  // Injects elevate.exe directly into the already-built NSIS archive via a temp staging dir, and
  // defers copying it into win-unpacked until every target has finished reading the shared
  // appOutDir. This keeps elevate.exe in the dir-target output while guaranteeing concurrent
  // targets (Squirrel, ZIP, appx, …) never capture it mid-build (fixes the #9852 race).
  async addToArchive(archiveFile: string, target: NsisTarget, format: string, archiveOptions: ArchiveOptions, appOutDir: string): Promise<void> {
    const elevatePath = await this.resolve(target)
    if (!elevatePath) {
      return
    }

    const stagingDir = await target.packager.tempDirManager.getTempDir({ prefix: "elevate-staging" })
    const resourcesDir = path.join(stagingDir, "resources")
    await fs.mkdir(resourcesDir, { recursive: true })
    const stagedElevate = path.join(resourcesDir, "elevate.exe")
    await copyFile(elevatePath, stagedElevate, false)

    if (!isWindowsSigningDisabled(target.packager.platformOptions)) {
      await target.packager.signIf(stagedElevate)
    }

    // Reuse the parent archive's compression args so the appended entry is consistent with the
    // rest of the archive (notably `store` and differential-aware builds, where bare `7za a`
    // defaults — solid on, -mx=9, NTFS timestamps — would diverge from the original entries).
    const args = compute7zCompressArgs(format, archiveOptions)
    args.push(archiveFile, "resources/elevate.exe")
    await exec(await getPath7za(), args, { cwd: stagingDir }, debug7z.enabled)

    // Defer the win-unpacked copy: it must land after every concurrent target has packaged
    // appOutDir, so it is never captured by Squirrel/zip/etc. The staged (and possibly signed)
    // binary lives in tempDirManager, which is cleaned up only after the build finishes.
    if (!this.stagedUnpackedCopies.has(appOutDir)) {
      this.stagedUnpackedCopies.add(appOutDir)
      target.packager.addBuildFinalizeTask(() => copyFile(stagedElevate, path.join(appOutDir, "resources", "elevate.exe"), false))
    }
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
