import { Arch, copyFile, debug7z, dirSize, exec, log } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import * as fs from "fs/promises"
import * as path from "path"
import * as zlib from "zlib"
import { getNsisElevatePath } from "../../toolsets/windows"
import { getPath7za } from "../../toolsets/7zip"
import { getTemplatePath } from "../../util/pathManager"
import { ArchiveOptions, compute7zCompressArgs } from "../archive"
import { NsisTarget } from "./NsisTarget"

export const nsisTemplatesDir = getTemplatePath("nsis")

export interface PackArchResult {
  fileInfo: PackageFileInfo
  unpackedSize: number
}

export class AppPackageHelper {
  // keyed by arch + the requesting target's appPackageCacheKey: targets only share an app package
  // when packaging it for them would produce the same archive
  private readonly archToResult = new Map<string, Promise<PackArchResult>>()
  private readonly archToPackageCount = new Map<Arch, number>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  constructor(private readonly elevateHelper: CopyElevateHelper) {}

  async packArch(arch: Arch, target: NsisTarget): Promise<PackArchResult> {
    const cacheKey = `${arch}:${target.appPackageCacheKey}`
    let resultPromise = this.archToResult.get(cacheKey)
    if (resultPromise == null) {
      const appOutDir = target.archs.get(arch)!
      // the first package of an arch keeps the usual file name; any further one (a target with
      // different packaging settings) gets a distinct name so it never overwrites the other
      const packageCount = (this.archToPackageCount.get(arch) ?? 0) + 1
      this.archToPackageCount.set(arch, packageCount)
      const fileNameSuffix = packageCount === 1 ? "" : `-${packageCount}`
      resultPromise = target.buildAppPackage(appOutDir, arch, this.elevateHelper, fileNameSuffix).then(async fileInfo => ({
        fileInfo,
        unpackedSize: await dirSize(appOutDir),
      }))
      this.archToResult.set(cacheKey, resultPromise)
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
    if (!target.packager.info.framework.isCopyElevateHelper) {
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
      this.elevatePath = getNsisElevatePath(target.packager.config.toolsets?.nsis, target.options.customNsisBinary)
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

    const stagingDir = await target.packager.info.tempDirManager.getTempDir({ prefix: "elevate-staging" })
    const resourcesDir = path.join(stagingDir, "resources")
    await fs.mkdir(resourcesDir, { recursive: true })
    const stagedElevate = path.join(resourcesDir, "elevate.exe")
    await copyFile(elevatePath, stagedElevate, false)

    const { signAndEditExecutable, signExecutable } = target.packager.platformSpecificBuildOptions
    if (signAndEditExecutable !== false && signExecutable !== false) {
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
    // copied, because the uninstaller icon is patched into it below
    const executable = Buffer.from(buffer.subarray(0, nsisOffset))
    const nsisSize = buffer.length - nsisOffset
    const nsisReader = new BinaryReader(buffer.subarray(nsisOffset, nsisOffset + nsisSize))
    if (!isNsisFirstHeader(buffer, nsisOffset)) {
      throw new Error("Invalid signature.")
    }
    nsisReader.skip(NSIS_FIRST_HEADER_SIZE - 4)
    if (nsisSize !== nsisReader.uint32()) {
      throw new Error("Size mismatch.")
    }

    // The data block is a sequence of [size | compressed flag][data] entries (non-solid compression only).
    // makensis stores the uninstaller icon patch and then the uninstaller data as two consecutive entries (build.cpp uninstall_generate)
    let iconData: Buffer | null = null
    let innerBuffer: Buffer | null = null
    let previousBlock: Buffer | null = null
    while (true) {
      let size = nsisReader.uint32()
      const compressed = (size & 0x80000000) !== 0
      size = size & 0x7fffffff
      if (size === 0 || nsisReader.position + size > nsisReader.length || nsisReader.position >= nsisReader.length) {
        break
      }
      let block = nsisReader.bytes(size)
      if (compressed) {
        block = zlib.inflateRawSync(block)
      }
      if (isNsisFirstHeader(block, 0) && (block.readUInt32LE(0) & FH_FLAGS_UNINSTALL) !== 0) {
        if (innerBuffer) {
          throw new Error("Multiple inner blocks.")
        }
        innerBuffer = block
        iconData = previousBlock
      }
      previousBlock = block
    }
    if (!innerBuffer || !iconData) {
      throw new Error("Inner block not found.")
    }
    applyUninstallerIconData(executable, iconData)

    const uninstaller = Buffer.concat([executable, innerBuffer])
    verifyNsisIntegrity(uninstaller)
    await fs.writeFile(uninstallerPath, uninstaller)
  }
}

const NSIS_FIRST_HEADER_SIZE = 28
// siginfo (0xDEADBEEF) followed by "NullsoftInst"; the preceding 4 bytes of the firstheader are its flags
const NSIS_SIGNATURE = Buffer.from([0xef, 0xbe, 0xad, 0xde, 0x4e, 0x75, 0x6c, 0x6c, 0x73, 0x6f, 0x66, 0x74, 0x49, 0x6e, 0x73, 0x74])
const FH_FLAGS_MASK = 15
const FH_FLAGS_UNINSTALL = 1
const FH_FLAGS_NO_CRC = 4
const FH_FLAGS_FORCE_CRC = 8

function isNsisFirstHeader(data: Buffer, offset: number): boolean {
  return (
    offset + NSIS_FIRST_HEADER_SIZE <= data.length &&
    (data.readUInt32LE(offset) & ~FH_FLAGS_MASK) === 0 &&
    data.subarray(offset + 4, offset + 4 + NSIS_SIGNATURE.length).equals(NSIS_SIGNATURE)
  )
}

// WriteUninstaller (exehead/exec.c) patches the uninstaller icon into a copy of the installer's exehead before writing it out,
// and makensis computes the uninstaller CRC over that patched exehead. The icon data is a list of [size][offset][bytes] records.
function applyUninstallerIconData(executable: Buffer, iconData: Buffer) {
  let position = 0
  // exec.c stops at the first zero byte (not a zero dword), so mirror that exactly
  while (position < iconData.length && iconData[position] !== 0) {
    if (position + 8 > iconData.length) {
      throw new Error("Truncated uninstaller icon data.")
    }
    const size = iconData.readUInt32LE(position)
    const offset = iconData.readUInt32LE(position + 4)
    position += 8
    if (position + size > iconData.length || offset + size > executable.length) {
      throw new Error("Invalid uninstaller icon data.")
    }
    iconData.copy(executable, offset, position, position + size)
    position += size
  }
  if (position >= iconData.length) {
    throw new Error("Uninstaller icon data is not terminated.")
  }
}

let crc32Table: Uint32Array | null = null

// zlib.crc32 is only available since Node.js 20.15.0 / 22.2.0
function crc32(data: Buffer): number {
  if (typeof zlib.crc32 === "function") {
    return zlib.crc32(data)
  }
  if (crc32Table == null) {
    crc32Table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
      crc32Table[i] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Performs the same integrity check that the NSIS exehead runs on startup (loadHeaders in exehead/fileform.c),
 * so a broken uninstaller fails the build instead of showing "Installer integrity check has failed" to the end user.
 */
export function verifyNsisIntegrity(data: Buffer): void {
  // the exehead looks for the firstheader at 512-byte boundaries
  for (let offset = 0; offset < data.length; offset += 512) {
    if (!isNsisFirstHeader(data, offset)) {
      continue
    }
    const flags = data.readUInt32LE(offset)
    if ((flags & FH_FLAGS_FORCE_CRC) === 0 && (flags & FH_FLAGS_NO_CRC) !== 0) {
      return
    }
    const lengthOfAllFollowingData = data.readUInt32LE(offset + 24)
    if (lengthOfAllFollowingData < NSIS_FIRST_HEADER_SIZE + 4 || lengthOfAllFollowingData > data.length - offset) {
      throw new Error("NSIS integrity check failed: data length mismatch.")
    }
    // the first 512 bytes are not covered, the CRC itself is stored right after the checked data
    const crcOffset = offset + lengthOfAllFollowingData - 4
    const actual = crc32(data.subarray(offset === 0 ? 0 : 512, crcOffset))
    const expected = data.readUInt32LE(crcOffset)
    if (actual !== expected) {
      throw new Error(`NSIS integrity check failed: CRC32 is 0x${actual.toString(16)}, expected 0x${expected.toString(16)}.`)
    }
    return
  }
  throw new Error("NSIS integrity check failed: NSIS header not found.")
}
