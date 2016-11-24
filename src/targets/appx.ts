import { getArchSuffix } from "../platformPackager"
import { Arch } from "../metadata"
import { WinPackager } from "../winPackager"
import { use, spawn } from "../util/util"
import { emptyDir, copy, readFile, writeFile } from "fs-extra-p"
import * as path from "path"
import { AppXOptions } from "../options/winOptions"
import BluebirdPromise from "bluebird-lst-c"
import { Target } from "./targetFactory"
import { getSignVendorPath } from "../windowsCodeSign"
import sanitizeFileName from "sanitize-filename"

export default class AppXTarget extends Target {
  private readonly options: AppXOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, this.packager.devMetadata.build.appx)

  constructor(private readonly packager: WinPackager, private readonly outDir: string) {
    super("appx")
  }

  // no flatten - use asar or npm 3 or yarn
  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager

    const cscInfo = await packager.cscInfo
    if (cscInfo == null) {
      throw new Error("AppX package must be signed, but certificate is not set, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing")
    }

    // todo grab publisher info from cert
    if (this.options.publisher == null) {
      throw new Error("Please specify appx.publisher")
    }

    const appInfo = packager.appInfo

    const preAppx = path.join(this.outDir, `pre-appx-${getArchSuffix(arch)}`)
    await emptyDir(preAppx)

    const templatePath = path.join(__dirname, "..", "..", "templates", "appx")
    const safeName = sanitizeFileName(appInfo.name)
    const resourceList = await packager.resourceList
    await BluebirdPromise.all([
      BluebirdPromise.map(["44x44", "50x50", "150x150", "310x150"], size => {
        const target = path.join(preAppx, "assets", `${safeName}.${size}.png`)
        if (resourceList.includes(`${size}.png`)) {
          return copy(path.join(packager.buildResourcesDir, `${size}.png`), target)
        }
        return copy(path.join(templatePath, "assets", `SampleAppx.${size}.png`), target)
      }),
      copy(appOutDir, path.join(preAppx, "app")),
      this.writeManifest(templatePath, preAppx, safeName)
    ])

    const destination = path.join(this.outDir, packager.generateName("appx", arch, false))
    const args = ["pack", "/o", "/d", preAppx, "/p", destination]
    use(this.options.makeappxArgs, (it: Array<string>) => args.push(...it))
    // wine supports only ia32 binary in any case makeappx crashed on wine
    // await execWine(path.join(await getSignVendorPath(), "windows-10", process.platform === "win32" ? process.arch : "ia32", "makeappx.exe"), args)
    await spawn(path.join(await getSignVendorPath(), "windows-10", process.arch, "makeappx.exe"), args)

    await packager.sign(destination)
    packager.dispatchArtifactCreated(destination, packager.generateName("appx", arch, true))
  }

  private async writeManifest(templatePath: string, preAppx: string, safeName: string) {
    const appInfo = this.packager.appInfo
    const manifest = (await readFile(path.join(templatePath, "appxmanifest.xml"), "utf8"))
      .replace(/\$\{([a-zA-Z]+)\}/g, (match, p1): string => {
        switch (p1) {
          case "publisher":
            return this.options.publisher!

          case "author":
            return appInfo.companyName

          case "version":
            return appInfo.versionInWeirdWindowsForm

          case "name":
            return appInfo.name

          case "executable":
            return `app\\${appInfo.productFilename}.exe`

          case "displayName":
            return appInfo.productName

          case "description":
            return appInfo.description || appInfo.productName

          case "backgroundColor":
            return this.options.backgroundColor || "#464646"

          case "safeName":
            return safeName

          default:
            throw new Error(`Macro ${p1} is not defined`)
        }
      })
    await writeFile(path.join(preAppx, "appxmanifest.xml"), manifest)
  }
}