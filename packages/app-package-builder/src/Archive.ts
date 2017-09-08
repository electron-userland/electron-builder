import { Folder } from "./Folder"
import { SevenZArchiveEntry } from "./SevenZArchiveEntry"
import { SubStreamsInfo } from "./SevenZFile"

export class Archive {
  // A relative file pointer to the first stream of data in the 7z file (relative to the end of the 7z signature header)
  packPosition: number

  // file index to file packed size
  packedSizes: Array<number>

  // ignore - not required
  // packedCrcsDefined: BitSet
  // packCrcs: Array<number>

  folders: Array<Folder>
  subStreamsInfo: SubStreamsInfo

  files: Array<SevenZArchiveEntry>
  streamMap: StreamMap

  headerSize: number
}

export class StreamMap {
  // Offset to beginning of this pack stream's data, relative to the beginning of the first pack stream.
  packStreamOffsets: Array<number>

  // Index of first file for each folder.
  folderFirstFileIndex: Array<number>

  // Index of folder for each file.
  // fileFolderIndex: Array<number>

  toString() {
    return `StreamMap, offsets of ${this.packStreamOffsets.length} packed streams, first files of ${this.folderFirstFileIndex.length} folders`
  }
}