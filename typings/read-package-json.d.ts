declare module "read-package-json" {
  function readJson(file: string, callback: (error: Error, data: any) => void): void

  export = readJson
}