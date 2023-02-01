declare module "decompress-zip" {
  import { EventEmitter } from "events"

  interface FileDescriptor {
    path: string
  }

  export default class DecompressZip extends EventEmitter {
    constructor(filename: string)

    list(): void

    getFiles(): Promise<Array<FileDescriptor>>

    extract(options: {path: string, filter?: (file: string) => boolean}): void

    extractFile(file: FileDescriptor, options: {path: string, filter?: (file: string) => boolean}): Promise<void>
  }
}