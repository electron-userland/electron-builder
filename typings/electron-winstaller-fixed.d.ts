declare module "electron-winstaller-fixed" {
  export function createWindowsInstaller(options: any): Promise<any>

  export function convertVersion(version: string): string
}