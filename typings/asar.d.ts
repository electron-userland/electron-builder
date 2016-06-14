declare module "asar" {
  import { Stats } from "fs"

  interface AsarFileInfo {
    offset: number
    size: number
  }

  interface AsarFileMetadata {
    type: "file" | "directory" | "link"
    stat?: Stats
  }

  interface AsarOptions {
    unpack?: string
    unpackDir?: string
    dot?: boolean
  }

  export function listPackage(archive: string): Array<string>

  // followLinks defaults to true
  export function statFile(archive: string, filename: string, followLinks?: boolean): AsarFileInfo | null

  export function createPackageFromFiles(src: string, dest: string, filenames: Array<string>, metadata: { [key: string]: AsarFileMetadata;}, options: AsarOptions, callback: (error?: Error) => void): void
}