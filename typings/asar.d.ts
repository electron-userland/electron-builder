declare module "asar" {
  interface Info {
    offset: number
    size: number
  }

  export function listPackage(archive: string): Array<string>

  // followLinks defaults to true
  export function statFile(archive: string, filename: string, followLinks?: boolean): Info
}