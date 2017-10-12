import { SIGNATURE_HEADER_SIZE } from "builder-util-runtime/out/blockMapApi"
import { read } from "fs-extra-p"
import { Archive, StreamMap } from "./Archive"
import { BitSet } from "./BitSet"
import { BindPair, Coder, Folder } from "./Folder"
import { LittleEndianBuffer } from "./LittleEndianBuffer"
import { SevenZArchiveEntry } from "./SevenZArchiveEntry"

const sevenZSignature = Buffer.concat([Buffer.from("7z", "binary"), Buffer.from([0xBC, 0xAF, 0x27, 0x1C])])
/* start header size */

const kEnd = 0x00
const kArchiveProperties = 0x02
const kAdditionalStreamsInfo = 0x03
const kMainStreamsInfo = 0x04
const kEncodedHeader = 0x17
const kHeader = 0x01
const kFilesInfo = 0x05
const kPackInfo = 0x06
const kUnpackInfo = 0x07
const kSubStreamsInfo = 0x08
const kSize = 0x09
const kCRC = 0x0A
const kFolder = 0x0B
const kCodersUnpackSize = 0x0C
const kNumUnpackStream = 0x0D
const kEmptyStream = 0x0E
const kEmptyFile = 0x0F
const kAnti = 0x10
const kName = 0x11
const kCTime = 0x12
const kATime = 0x13
const kMTime = 0x14
const kWinAttributes = 0x15
const kStartPos = 0x18
const kDummy = 0x19

export class SevenZFile {
  archive: Archive

  constructor(readonly fd: number) {
  }

  async read() {
    this.archive = await this.readHeaders()
  }

  private async readHeaders() {
    let _buf = Buffer.allocUnsafe(SIGNATURE_HEADER_SIZE)
    await read(this.fd, _buf, 0, _buf.length, 0)
    const index = sevenZSignature.length
    const signature = _buf.slice(0, index)
    if (!sevenZSignature.equals(signature)) {
      throw new Error("Bad 7z signature")
    }

    let buf = new LittleEndianBuffer(_buf, index)
    // 7zFormat.txt has it wrong - it's first major then minor
    const archiveVersionMajor = buf.readByte()
    const archiveVersionMinor = buf.readByte()
    if (archiveVersionMajor !== 0) {
      throw new Error(`Unsupported 7z version (${archiveVersionMajor},${archiveVersionMinor})`)
    }

    const startHeaderCrc = buf.readUnsignedInt()

    const startHeader = readStartHeader(startHeaderCrc, buf)
    _buf = Buffer.allocUnsafe(startHeader.nextHeaderSize)
    await read(this.fd, _buf, 0, _buf.length, SIGNATURE_HEADER_SIZE + startHeader.nextHeaderOffset)

    // if (startHeader.nextHeaderCrc !== crc32(_buf)) {
    //   throw new Error("Header CRC mismatch")
    // }

    const archive = new Archive()
    archive.headerSize = startHeader.nextHeaderSize

    buf = new LittleEndianBuffer(_buf)
    const nid = buf.readByte()
    if (nid === kEncodedHeader) {
      throw new Error("Encoded header is not supported")
    }
    if (nid === kHeader) {
      readHeader(buf, archive)
    }
    else {
      throw new Error("Broken or unsupported archive: no Header")
    }

    return archive
  }

  // private async readEncodedHeader(header: LittleEndianBuffer, archive: Archive) {
  //   readStreamsInfo(header, archive)
  //
  //   throw new Error("readEncodedHeader")
  //
  //   // const folder = archive.folders[0]
  //   // const firstPackStreamIndex = 0
  //   // const folderOffset = SIGNATURE_HEADER_SIZE + archive.packPos
  //   // const _buf = Buffer.allocUnsafe(archive.packSizes[firstPackStreamIndex])
  //   // await read(this.fd, _buf, 0, _buf.length, folderOffset)
  //   // for (const coder of folder.getOrderedCoders()) {
  //   //   if (coder.numInStreams !== 1 || coder.numOutStreams !== 1) {
  //   //       throw new Error("Multi input/output stream coders are not yet supported")
  //   //   }
  //     // inputStreamStack = Coders.addDecoder(fileName, inputStreamStack, folder.getUnpackSizeForCoder(coder), coder)
  // // }
  // // if (folder.hasCrc) {
  // //     inputStreamStack = new CRC32VerifyingInputStream(inputStreamStack,
  // //             folder.getUnpackSize(), folder.crc);
  // // }
  // // const nextHeader = Buffer.allocUnsafe(folder.getUnpackSize())
  // // try (DataInputStream nextHeaderInputStream = new DataInputStream(inputStreamStack)) {
  // //     nextHeaderInputStream.readFully(nextHeader);
  // // }
  // // return new LittleEndianBuffer(nextHeader)
  // }
}

// noinspection JSUnusedLocalSymbols
function readStartHeader(startHeaderCrc: number, buf: LittleEndianBuffer) {
  // if (startHeaderCrc !== crc32(buf.slice())) {
  //   throw new Error("startHeader CRC mismatch")
  // }

  const nextHeaderOffset = buf.readLong()
  const nextHeaderSize = buf.readLong()
  const nextHeaderCrc = buf.readUnsignedInt()
  return new StartHeader(nextHeaderOffset, nextHeaderSize, nextHeaderCrc)
}

function readHeader(header: LittleEndianBuffer, archive: Archive) {
  let nid = header.readUnsignedByte()

  if (nid === kArchiveProperties) {
    readArchiveProperties(header)
    nid = header.readUnsignedByte()
  }

  if (nid === kAdditionalStreamsInfo) {
    throw new Error("Additional streams unsupported")
  }

  if (nid === kMainStreamsInfo) {
    readStreamsInfo(header, archive)
    nid = header.readUnsignedByte()
  }

  if (nid === kFilesInfo) {
    readFilesInfo(header, archive)
    nid = header.readUnsignedByte()
  }

  if (nid !== kEnd) {
    throw new Error(`Badly terminated header, found ${nid}`)
  }
}

function readFilesInfo(header: LittleEndianBuffer, archive: Archive) {
  const numFiles = readUint64(header)
  const files = new Array<SevenZArchiveEntry>(numFiles)
  for (let i = 0; i < files.length; i++) {
    files[i] = new SevenZArchiveEntry()
  }
  let isEmptyStream: BitSet | null = null
  let isEmptyFile: BitSet | null = null
  let isAnti: BitSet | null = null
  while (true) {
    const propertyType = header.readUnsignedByte()
    if (propertyType === 0) {
      break
    }
    const size = readUint64(header)
    switch (propertyType) {
      case kEmptyStream: {
        isEmptyStream = readBits(header, files.length)
        break
      }
      case kEmptyFile: {
        if (isEmptyStream == null) { // protect against NPE
          throw new Error("Header format error: kEmptyStream must appear before kEmptyFile")
        }
        isEmptyFile = readBits(header, isEmptyStream.cardinality())
        break
      }
      case kAnti: {
        if (isEmptyStream == null) { // protect against NPE
          throw new Error("Header format error: kEmptyStream must appear before kAnti")
        }
        isAnti = readBits(header, isEmptyStream.cardinality())
        break
      }
      case kName: {
        const external = header.readUnsignedByte()
        if (external !== 0) {
          throw new Error("Not implemented")
        }
        if (((size - 1) & 1) !== 0) {
          throw new Error("File names length invalid")
        }
        const names = Buffer.allocUnsafe(size - 1)
        header.get(names)
        let nextFile = 0
        let nextName = 0
        for (let i = 0; i < names.length; i += 2) {
          if (names[i] === 0 && names[i + 1] === 0) {
            files[nextFile++].name = Buffer.from(names.slice(nextName, i)).toString("utf16le")
            nextName = i + 2
          }
        }
        if (nextName !== names.length || nextFile !== files.length) {
          throw new Error("Error parsing file names")
        }
        break
      }
      case kCTime: {
        throw new Error("Must be no kCTime")
      }
      case kATime: {
        throw new Error("Must be no kATime")
      }
      case kMTime: {
        throw new Error("Must be no kMTime")
      }
      case kWinAttributes: {
        const attributesDefined = readAllOrBits(header, files.length)
        const external = header.readUnsignedByte()
        if (external !== 0) {
          throw new Error("Unimplemented")
        }
        for (let i = 0; i < files.length; i++) {
          files[i].hasWindowsAttributes = attributesDefined.get(i)
          if (files[i].hasWindowsAttributes) {
            files[i].windowsAttributes = header.readInt()
          }
        }
        break
      }
      case kStartPos: {
        throw new Error("kStartPos is unsupported")
      }
      case kDummy: {
        if (skipBytesFully(header, size) < size) {
          throw new Error("Incomplete kDummy property")
        }
        break
      }

      default: {
        if (skipBytesFully(header, size) < size) {
          throw new Error(`Incomplete property of type ${propertyType}`)
        }
        break
      }
    }
  }

  let nonEmptyFileCounter = 0
  let emptyFileCounter = 0
  for (let i = 0; i < files.length; i++) {
    files[i].hasStream = isEmptyStream == null || !isEmptyStream.get(i)
    if (files[i].hasStream) {
      files[i].isDirectory = false
      files[i].isAntiItem = false
      files[i].hasCrc = archive.subStreamsInfo.hasCrc.get(nonEmptyFileCounter)
      files[i].crcValue = archive.subStreamsInfo.crcs[nonEmptyFileCounter]
      files[i].size = archive.subStreamsInfo.unpackSizes[nonEmptyFileCounter]
      ++nonEmptyFileCounter
    }
    else {
      files[i].isDirectory = isEmptyFile == null || !isEmptyFile.get(emptyFileCounter)
      files[i].isAntiItem = isAnti != null && isAnti.get(emptyFileCounter)
      files[i].hasCrc = false
      files[i].size = 0
      ++emptyFileCounter
    }
  }
  archive.files = files
  calculateStreamMap(archive)
}

function calculateStreamMap(archive: Archive) {
  const streamMap = new StreamMap()

  let nextFolderPackStreamIndex = 0
  const numFolders = archive.folders != null ? archive.folders.length : 0
  for (let i = 0; i < numFolders; i++) {
    const folder = archive.folders[i]
    folder.firstPackedStreamIndex = nextFolderPackStreamIndex
    nextFolderPackStreamIndex += folder.packedStreams.length
  }

  let nextPackStreamOffset = 0
  const numPackSizes = archive.packedSizes != null ? archive.packedSizes.length : 0
  streamMap.packStreamOffsets = new Array(numPackSizes)
  for (let i = 0; i < numPackSizes; i++) {
    streamMap.packStreamOffsets[i] = nextPackStreamOffset
    nextPackStreamOffset += archive.packedSizes[i]
  }

  streamMap.folderFirstFileIndex = new Array(numFolders)
  let nextFolderIndex = 0
  let nextFolderUnpackStreamIndex = 0
  for (let i = 0; i < archive.files.length; i++) {
    const file = archive.files[i]
    if (!file.hasStream && nextFolderUnpackStreamIndex === 0) {
      file.blockIndex = -1
      continue
    }
    if (nextFolderUnpackStreamIndex === 0) {
      for (; nextFolderIndex < archive.folders.length; ++nextFolderIndex) {
        streamMap.folderFirstFileIndex[nextFolderIndex] = i
        const folder = archive.folders[nextFolderIndex]
        if (folder.numUnpackSubStreams > 0) {
          break
        }
      }
      if (nextFolderIndex >= archive.folders.length) {
        throw new Error("Too few folders in archive")
      }
    }
    file.blockIndex = nextFolderIndex
    if (!file.hasStream) {
      continue
    }
    ++nextFolderUnpackStreamIndex
    if (nextFolderUnpackStreamIndex >= archive.folders[nextFolderIndex].numUnpackSubStreams) {
      ++nextFolderIndex
      nextFolderUnpackStreamIndex = 0
    }
  }

  archive.streamMap = streamMap
}

function skipBytesFully(input: LittleEndianBuffer, bytesToSkip: number) {
  if (bytesToSkip < 1) {
    return 0
  }
  const maxSkip = input.remaining()
  if (maxSkip < bytesToSkip) {
    bytesToSkip = maxSkip
  }
  input.skip(bytesToSkip)
  return bytesToSkip
}

function readArchiveProperties(input: LittleEndianBuffer) {
  // just skip it
  let nid = input.readUnsignedByte()
  while (nid !== kEnd) {
    input.skip(readUint64(input))
    nid = input.readUnsignedByte()
  }
}

function readStreamsInfo(header: LittleEndianBuffer, archive: Archive) {
  let nid = header.readUnsignedByte()
  if (nid === kPackInfo) {
    readPackInfo(header, archive)
    nid = header.readUnsignedByte()
  }

  if (nid === kUnpackInfo) {
    readUnpackInfo(header, archive)
    nid = header.readUnsignedByte()
  }
  else {
    // archive without unpack/coders info
    archive.folders = []
  }

  if (nid === kSubStreamsInfo) {
    readSubStreamsInfo(header, archive)
    nid = header.readUnsignedByte()
  }

  if (nid !== kEnd) {
    throw new Error("Badly terminated StreamsInfo")
  }
}

function readSubStreamsInfo(header: LittleEndianBuffer, archive: Archive) {
  for (const folder of archive.folders) {
    folder.numUnpackSubStreams = 1
  }

  let totalUnpackStreams = archive.folders.length

  let nid = header.readUnsignedByte()
  if (nid === kNumUnpackStream) {
    totalUnpackStreams = 0
    for (const folder of archive.folders) {
      const numStreams = readUint64(header)
      folder.numUnpackSubStreams = numStreams
      totalUnpackStreams += numStreams
    }
    nid = header.readUnsignedByte()
  }

  const subStreamsInfo = new SubStreamsInfo()
  subStreamsInfo.unpackSizes = new Array(totalUnpackStreams)
  subStreamsInfo.hasCrc = new BitSet(totalUnpackStreams)
  subStreamsInfo.crcs = new Array(totalUnpackStreams)

  let nextUnpackStream = 0
  for (const folder of archive.folders) {
    if (folder.numUnpackSubStreams === 0) {
      continue
    }
    let sum = 0
    if (nid === kSize) {
      for (let i = 0; i < folder.numUnpackSubStreams - 1; i++) {
        const size = readUint64(header)
        subStreamsInfo.unpackSizes[nextUnpackStream++] = size
        sum += size
      }
    }
    subStreamsInfo.unpackSizes[nextUnpackStream++] = folder.getUnpackSize() - sum
  }
  if (nid === kSize) {
    nid = header.readUnsignedByte()
  }

  let numDigests = 0
  for (const folder of archive.folders) {
    if (folder.numUnpackSubStreams !== 1 || !folder.hasCrc) {
      numDigests += folder.numUnpackSubStreams
    }
  }

  if (nid === kCRC) {
    const hasMissingCrc = readAllOrBits(header, numDigests)
    const missingCrcs = new Array<number>(numDigests)
    for (let i = 0; i < numDigests; i++) {
      if (hasMissingCrc.get(i)) {
        missingCrcs[i] = header.readUnsignedInt()
      }
    }
    let nextCrc = 0
    let nextMissingCrc = 0
    for (const folder of archive.folders) {
      if (folder.numUnpackSubStreams === 1 && folder.hasCrc) {
        subStreamsInfo.hasCrc.set(nextCrc)
        subStreamsInfo.crcs[nextCrc] = folder.crc
        ++nextCrc
      }
      else {
        for (let i = 0; i < folder.numUnpackSubStreams; i++) {
          if (hasMissingCrc.get(nextMissingCrc)) {
            subStreamsInfo.hasCrc.set(nextCrc)
          }
          else {
            subStreamsInfo.hasCrc.clear(nextCrc)
          }
          subStreamsInfo.crcs[nextCrc] = missingCrcs[nextMissingCrc]
          ++nextCrc
          ++nextMissingCrc
        }
      }
    }

    nid = header.readUnsignedByte()
  }

  if (nid !== kEnd) {
    throw new Error("Badly terminated SubStreamsInfo")
  }

  archive.subStreamsInfo = subStreamsInfo
}

function readUnpackInfo(header: LittleEndianBuffer, archive: Archive) {
  let nid = header.readUnsignedByte()
  if (nid !== kFolder) {
    throw new Error(`Expected kFolder, got ${nid}`)
  }

  const numFolders = readUint64(header)
  const folders = new Array<Folder>(numFolders)
  archive.folders = folders
  const external = header.readUnsignedByte()
  if (external !== 0) {
    throw new Error("External unsupported")
  }
  for (let i = 0; i < numFolders; i++) {
    folders[i] = readFolder(header)
  }

  nid = header.readUnsignedByte()
  if (nid !== kCodersUnpackSize) {
    throw new Error(`Expected kCodersUnpackSize, got ${nid}`)
  }
  for (const folder of folders) {
    folder.unpackSizes = new Array(folder.totalOutputStreams)
    for (let i = 0; i < folder.totalOutputStreams; i++) {
      folder.unpackSizes[i] = readUint64(header)
    }
  }

  nid = header.readUnsignedByte()
  if (nid === kCRC) {
    const crcsDefined = readAllOrBits(header, numFolders)
    for (let i = 0; i < numFolders; i++) {
      if (crcsDefined.get(i)) {
        folders[i].hasCrc = true
        folders[i].crc = 0xffffFFFF & header.readInt()
      }
      else {
        folders[i].hasCrc = false
      }
    }

    nid = header.readUnsignedByte()
  }

  if (nid !== kEnd) {
    throw new Error("Badly terminated UnpackInfo")
  }
}

function readFolder(header: LittleEndianBuffer) {
  const folder = new Folder()

  const numCoders = readUint64(header)
  const coders = new Array<Coder>(numCoders)
  let totalInStreams = 0
  let totalOutStreams = 0
  for (let i = 0; i < coders.length; i++) {
    coders[i] = new Coder()
    const bits = header.readUnsignedByte()
    const idSize = bits & 0xf
    const isSimple = (bits & 0x10) === 0
    const hasAttributes = (bits & 0x20) !== 0
    const moreAlternativeMethods = (bits & 0x80) !== 0

    coders[i].decompressionMethodId = Buffer.allocUnsafe(idSize)
    header.get(coders[i].decompressionMethodId)
    if (isSimple) {
      coders[i].numInStreams = 1
      coders[i].numOutStreams = 1
    }
    else {
      coders[i].numInStreams = readUint64(header)
      coders[i].numOutStreams = readUint64(header)
    }
    totalInStreams += coders[i].numInStreams
    totalOutStreams += coders[i].numOutStreams
    if (hasAttributes) {
        const propertiesSize = readUint64(header)
        coders[i].properties = Buffer.allocUnsafe(propertiesSize)
        header.get(coders[i].properties)
    }
    // would need to keep looping as above:
    // noinspection LoopStatementThatDoesntLoopJS
    while (moreAlternativeMethods) {
      throw new Error("Alternative methods are unsupported, please report. The reference implementation doesn't support them either.")
    }
  }
  folder.coders = coders
  folder.totalInputStreams = totalInStreams
  folder.totalOutputStreams = totalOutStreams

  if (totalOutStreams === 0) {
    throw new Error("Total output streams can't be 0")
  }
  const numBindPairs = totalOutStreams - 1
  const bindPairs = new Array<BindPair>(numBindPairs)
  for (let i = 0; i < numBindPairs; i++) {
    bindPairs[i] = new BindPair()
    bindPairs[i].inIndex = readUint64(header)
    bindPairs[i].outIndex = readUint64(header)
  }
  folder.bindPairs = bindPairs

  if (totalInStreams < numBindPairs) {
    throw new Error("Total input streams can't be less than the number of bind pairs")
  }

  const numPackedStreams = totalInStreams - numBindPairs
  const packedStreams = new Array<number>(numPackedStreams)
  if (numPackedStreams === 1) {
    let i
    for (i = 0; i < totalInStreams; i++) {
      if (folder.findBindPairForInStream(i) < 0) {
        break
      }
    }
    if (i === totalInStreams) {
      throw new Error("Couldn't find stream's bind pair index")
    }
    packedStreams[0] = i
  }
  else if (numPackedStreams > 1) {
    for (let i = 0; i < numPackedStreams; i++) {
      packedStreams[i] = readUint64(header)
    }
  }
  folder.packedStreams = packedStreams

  return folder
}

function readPackInfo(header: LittleEndianBuffer, archive: Archive) {
  archive.packPosition = readUint64(header)

  const numPackStreams = readUint64(header)
  let nid = header.readUnsignedByte()
  if (nid === kSize) {
    archive.packedSizes = new Array(numPackStreams)
    for (let i = 0; i < archive.packedSizes.length; i++) {
      archive.packedSizes[i] = readUint64(header)
    }
    nid = header.readUnsignedByte()
  }

  if (nid === kCRC) {
    // just read and ignore crc
    const packedCrcsDefined = readAllOrBits(header, numPackStreams)
    for (let i = 0; i < numPackStreams; i++) {
      if (packedCrcsDefined.get(i)) {
        header.skip(4)
      }
    }

    nid = header.readUnsignedByte()
  }

  if (nid !== kEnd) {
    throw new Error(`Badly terminated PackInfo (${nid})`)
  }
}

function readAllOrBits(header: LittleEndianBuffer, size: number) {
  const areAllDefined = header.readUnsignedByte()
  let bits: BitSet
  if (areAllDefined !== 0) {
    bits = new BitSet(size)
    for (let i = 0; i < size; i++) {
      bits.set(i)
    }
  }
  else {
    bits = readBits(header, size)
  }
  return bits
}

function readBits(header: LittleEndianBuffer, size: number) {
  const bits = new BitSet(size)
  let mask = 0
  let cache = 0
  for (let i = 0; i < size; i++) {
    if (mask === 0) {
      mask = 0x80
      cache = header.readUnsignedByte()
    }
    if ((cache & mask) !== 0) {
      bits.set(i)
    }
    else {
      bits.clear(i)
    }
    mask >>>= 1
  }
  return bits
}

function readUint64(input: LittleEndianBuffer) {
  // long rather than int as it might get shifted beyond the range of an int
  const firstByte = input.readUnsignedByte()
  let mask = 0x80
  let value = 0
  for (let i = 0; i < 8; i++) {
    if ((firstByte & mask) === 0) {
      return value | ((firstByte & (mask - 1)) << (8 * i))
    }
    const nextByte = input.readUnsignedByte()
    value |= nextByte << (8 * i)
    mask >>>= 1
  }
  return value
}

export class StartHeader {
  // noinspection JSUnusedGlobalSymbols
  constructor(readonly nextHeaderOffset: number, readonly nextHeaderSize: number, readonly nextHeaderCrc: number) {
  }
}

export class SubStreamsInfo {
  unpackSizes: Array<number>
  hasCrc: BitSet
  crcs: Array<number>
}