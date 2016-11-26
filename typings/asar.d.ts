declare module "asar-electron-builder" {
  interface AsarFileInfo {
    offset: number
    size: number
  }

  interface AsarOptions {
    dot?: boolean

    smartUnpack?: boolean

    ordering?: string | null

    extraMetadata?: any | null
  }

  export function listPackage(archive: string): Array<string>

  // followLinks defaults to true
  export function statFile(archive: string, filename: string, followLinks?: boolean): AsarFileInfo | null

  export function extractFile(archive: string, filename: string): Buffer | null

  // export function createPackageFromFiles(src: string, dest: string, filenames: Array<string>, metadata: { [key: string]: AsarFileMetadata;}, options: AsarOptions, callback: (error?: Error) => void): void
}