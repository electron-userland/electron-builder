import BluebirdPromise from "bluebird-lst"
import { Arch, getArchSuffix, Target } from "electron-builder-core"
import { spawn, use } from "electron-builder-util"
import { copyDir, copyFile } from "electron-builder-util/out/fs"
import { emptyDir, readFile, writeFile } from "fs-extra-p"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { AppXOptions } from "../options/winOptions"
import { getSignVendorPath, isOldWin6 } from "../windowsCodeSign"
import { WinPackager } from "../winPackager"

export default class AppXTarget extends Target {
  readonly options: AppXOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, this.packager.config.appx)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("appx")

    if (process.platform !== "win32" || isOldWin6()) {
      throw new Error("AppX is supported only on Windows 10 or Windows Server 2012 R2 (version number 6.3+)")
    }
  }

  // no flatten - use asar or npm 3 or yarn
  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager

    if ((await packager.cscInfo.value) == null) {
      throw new Error("AppX package must be signed, but certificate is not set, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing\n\nYou can use `./node_modules/.bin/create-self-signed-cert -p YourName` to create self-signed certificate")
    }

    let publisher = this.options.publisher
    if (publisher == null) {
      const computed = await packager.computedPublisherName.value
      if (computed != null) {
        publisher = `CN=${computed[0]}`
      }
      if (publisher == null) {
        throw new Error("Please specify appx.publisher")
      }
    }

    const appInfo = packager.appInfo

    const preAppx = path.join(this.outDir, `pre-appx-${getArchSuffix(arch)}`)
    await emptyDir(preAppx)

    const vendorPath = await getSignVendorPath()

    const templatePath = path.join(__dirname, "..", "..", "templates", "appx")
    const safeName = sanitizeFileName(appInfo.name)
    const resourceList = await packager.resourceList
    await BluebirdPromise.all([
      BluebirdPromise.map(["44x44", "50x50", "150x150", "310x150"], size => {
        const target = path.join(preAppx, "assets", `${safeName}.${size}.png`)
        if (resourceList.includes(`${size}.png`)) {
          return copyFile(path.join(packager.buildResourcesDir, `${size}.png`), target)
        }
        return copyFile(path.join(vendorPath, "appxAssets", `SampleAppx.${size}.png`), target)
      }),
      copyDir(appOutDir, path.join(preAppx, "app")),
      this.writeManifest(templatePath, preAppx, safeName, arch, publisher)
    ])

    const destination = path.join(this.outDir, packager.expandArtifactNamePattern(this.options, "appx", arch))
    const args = ["pack", "/o", "/d", preAppx, "/p", destination]
    use(this.options.makeappxArgs, (it: Array<string>) => args.push(...it))
    // wine supports only ia32 binary in any case makeappx crashed on wine
    // await execWine(path.join(await getSignVendorPath(), "windows-10", process.platform === "win32" ? process.arch : "ia32", "makeappx.exe"), args)
    await spawn(path.join(vendorPath, "windows-10", arch === Arch.ia32 ? "ia32" : "x64", "makeappx.exe"), args)

    await packager.sign(destination)
    packager.dispatchArtifactCreated(destination, this, arch, packager.expandArtifactNamePattern(this.options, "appx", arch, "${name}-${version}-${arch}.${ext}"))
  }

  private async writeManifest(templatePath: string, preAppx: string, safeName: string, arch: Arch, publisher: string) {
    const appInfo = this.packager.appInfo
    const manifest = (await readFile(path.join(templatePath, "appxmanifest.xml"), "utf8"))
      .replace(/\$\{([a-zA-Z]+)\}/g, (match, p1): string => {
        switch (p1) {
          case "publisher":
            return publisher

          case "publisherDisplayName":
            const name = this.options.publisherDisplayName || appInfo.companyName
            if (name == null) {
              throw new Error(`Please specify "author" in the application package.json — it is required because "appx.publisherDisplayName" is not set.`)
            }
            return name

          case "version":
            return appInfo.versionInWeirdWindowsForm

          case "name":
            return appInfo.name
            
          case "identityName":
            return this.options.identityName  || appInfo.name

          case "executable":
            return `app\\${appInfo.productFilename}.exe`

          case "displayName":
            return this.options.displayName || appInfo.productName
            
          case "description":
            return appInfo.description || appInfo.productName

          case "backgroundColor":
            return this.options.backgroundColor || "#464646"

          case "safeName":
            return safeName
            
          case "arch":
            return arch === Arch.ia32 ? "x86" : "x64"

          default:
            throw new Error(`Macro ${p1} is not defined`)
        }
      })
    await writeFile(path.join(preAppx, "appxmanifest.xml"), manifest)
  }
}
