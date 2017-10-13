import { SubFileDescriptor } from "./blockMap"

export class SevenZArchiveEntry implements SubFileDescriptor {
  hasStream: boolean
  isDirectory: boolean
  isAntiItem: boolean
  hasCrc: boolean
  crcValue: number
  size: number
  name: string
  hasWindowsAttributes: boolean
  windowsAttributes: number

  // folder index
  blockIndex: number

  dataStart: number
  dataEnd: number
}