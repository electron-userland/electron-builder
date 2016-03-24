declare module "decompress-zip" {
  import { EventEmitter } from "events"

  export = class DecompressZip extends EventEmitter {
    constructor(filename: string)

    list(): void
  }
}