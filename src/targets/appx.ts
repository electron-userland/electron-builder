import { getArchSuffix } from "../platformPackager"
import { Arch } from "../metadata"
import { WinPackager } from "../winPackager"
import { exec, use } from "../util/util"
import { emptyDir, copy, readFile, writeFile } from "fs-extra-p"
import * as path from "path"
import { AppXOptions } from "../options/winOptions"
import BluebirdPromise from "bluebird-lst-c"
import { Target } from "./targetFactory"

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
      throw new Error("AppX package must be signed, but certificate not specified, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing")
    }

    // todo grab publisher info from cert
    if (this.options.publisher == null) {
      throw new Error("Please specify appx.publisherName")
    }

    const appInfo = packager.appInfo

    const preAppx = path.join(this.outDir, `pre-appx-${getArchSuffix(arch)}`)
    await emptyDir(preAppx)

    const templatePath = path.join(__dirname, "..", "..", "templates", "appx")
    await BluebirdPromise.all([
      copy(path.join(templatePath, "assets"), path.join(preAppx, "assets")),
      copy(appOutDir, path.join(preAppx, "app")),
    ])

    const manifest = (await readFile(path.join(templatePath, "appxmanifest.xml"), "utf8"))
      .replace(/\$\{([a-zA-Z]+)\}/, function (match, p1) {
        switch (p1) {
          case "publisherName":
            return this.options.publisher

          case "packageVersion":
            return appInfo.versionInWeirdWindowsForm

          case "packageName":
            return appInfo.name

          case "packageExecutable":
            return `app\\${appInfo.productFilename}.exe`

          case "packageDisplayName":
            return appInfo.productName

          case "packageDescription":
            return appInfo.description || appInfo.productName

          case "packageBackgroundColor":
            return this.options.packageBackgroundColor || "#464646"
        }
      })
    await writeFile(path.join(preAppx, "appxmanifest.xml"), manifest)

    const destination = path.join(this.outDir, packager.generateName("appx", arch, false))

    // if (program.assets) {
    //   let assetPath = path.normalize(program.assets)
    //
    //   if (utils.hasVariableResources(assetPath)) {
    //     params.push('/l')
    //   }
    // }

    const args = ["pack", "/d", preAppx, "/p", destination]
    use(this.options.makeappxArgs, (it: Array<string>) => args.push(...it))
    await exec(path.join("C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64", "makeappx.exe"), args)

    await packager.sign(destination)
  }
}