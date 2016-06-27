import { LinuxBuildOptions, Arch } from "../metadata"
import { smarten, Target, PlatformPackager } from "../platformPackager"
import { use, getTempName, debug, exec } from "../util/util"
import { installPrefix } from "../linuxPackager"
import * as path from "path"
import { downloadFpm } from "../util/binDownload"
import { tmpdir } from "os"
import { remove, emptyDir, readdir, readFile, outputFile } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"

const template = require("lodash.template")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

export class FpmTarget extends Target {
  private readonly options = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.devMetadata.build)[this.name])

  private readonly fpmPath: Promise<string>

  private readonly packageFiles: Promise<Array<string>>
  private readonly scriptFiles: Promise<Array<string>>

  constructor(name: string, private packager: PlatformPackager<LinuxBuildOptions>, cleanupTasks: Array<() => Promise<any>>) {
    super(name)

    const tempDir = path.join(tmpdir(), getTempName("electron-builder-linux"))
    const tempDirPromise = emptyDir(tempDir)
      .then(() => {
        cleanupTasks.push(() => remove(tempDir))
        return tempDir
      })
    this.packageFiles = this.computePackageFiles(tempDirPromise)
    this.scriptFiles = this.createScripts(tempDirPromise)

    if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
      this.fpmPath = BluebirdPromise.resolve("fpm")
    }
    else {
      this.fpmPath = downloadFpm(process.platform === "darwin" ? "1.5.1-20150715-2.2.2" : "1.5.0-2.3.1", process.platform === "darwin" ? "osx" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`)
    }
  }

  private async computePackageFiles(tempDirPromise: Promise<string>): Promise<Array<string>> {
    const tempDir = await tempDirPromise

    const promises: Array<Promise<Array<string>>> = []
    if (this.packager.platformSpecificBuildOptions.desktop == null) {
      promises.push(this.computeDesktopIconPath(tempDir))
    }

    promises.push(this.computeDesktop(tempDir))

    return Array.prototype.concat.apply([], await BluebirdPromise.all(promises))
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIconPath(tempDir: string): Promise<Array<string>> {
    try {
      const mappings: Array<string> = []
      const pngIconsDir = path.join(this.packager.buildResourcesDir, "icons")
      for (let file of (await readdir(pngIconsDir))) {
        if (file!.endsWith(".png") || file!.endsWith(".PNG")) {
          // If parseInt encounters a character that is not a numeral in the specified radix,
          // it returns the integer value parsed up to that point
          try {
            const size = parseInt(file!, 10)
            if (size > 0) {
              mappings.push(`${pngIconsDir}/${file}=/usr/share/icons/hicolor/${size}x${size}/apps/${this.packager.appInfo.name}.png`)
            }
          }
          catch (e) {
            console.error(e)
          }
        }
      }

      return mappings
    }
    catch (e) {
      return this.createFromIcns(tempDir)
    }
  }

  private async createScripts(tempDirPromise: Promise<string>): Promise<Array<string>> {
    const tempDir = await tempDirPromise
    const defaultTemplatesDir = path.join(__dirname, "..", "..", "templates", "linux")

    const templateOptions = Object.assign({
      // old API compatibility
      executable: this.packager.appInfo.productFilename,
    }, this.packager.platformSpecificBuildOptions)

    const afterInstallTemplate = this.packager.platformSpecificBuildOptions.afterInstall || path.join(defaultTemplatesDir, "after-install.tpl")
    const afterInstallFilePath = writeConfigFile(tempDir, afterInstallTemplate, templateOptions)

    const afterRemoveTemplate = this.packager.platformSpecificBuildOptions.afterRemove || path.join(defaultTemplatesDir, "after-remove.tpl")
    const afterRemoveFilePath = writeConfigFile(tempDir, afterRemoveTemplate, templateOptions)

    return await BluebirdPromise.all<string>([afterInstallFilePath, afterRemoveFilePath])
  }

  async build(destination: string, target: string, appOutDir: string, arch: Arch): Promise<any> {
    const scripts = await this.scriptFiles
    const packager = this.packager
    const appInfo = packager.appInfo

    const projectUrl = await appInfo.computePackageUrl()
    if (projectUrl == null) {
      throw new Error("Please specify project homepage, see https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-homepage")
    }

    const options = this.options
    const author = options.maintainer || `${packager.appInfo.metadata.author.name} <${packager.appInfo.metadata.author.email}>`
    const synopsis = options.synopsis
    const args = [
      "-s", "dir",
      "-t", target,
      "--architecture", arch === Arch.ia32 ? "i386" : "amd64",
      "--name", appInfo.name,
      "--force",
      "--after-install", scripts[0],
      "--after-remove", scripts[1],
      "--description", smarten(target === "rpm" ? options.description! : `${synopsis || ""}\n ${options.description}`),
      "--maintainer", author,
      "--vendor", options.vendor || author,
      "--version", appInfo.version,
      "--package", destination,
      "--url", projectUrl,
    ]

    if (target === "deb") {
      args.push("--deb-compression", options.compression || (packager.devMetadata.build.compression === "store" ? "gz" : "xz"))
    }
    else if (target === "rpm") {
      // args.push("--rpm-compression", options.compression || (this.devMetadata.build.compression === "store" ? "none" : "xz"))
      args.push("--rpm-os", "linux")

      if (synopsis != null) {
        args.push("--rpm-summary", smarten(synopsis))
      }
    }

    let depends = options.depends
    if (depends == null) {
      if (target === "deb") {
        depends = ["libappindicator1", "libnotify-bin"]
      }
      else {
        depends = []
      }
    }
    else if (!Array.isArray(depends)) {
      if (typeof depends === "string") {
        depends = [<string>depends]
      }
      else {
        throw new Error(`depends must be Array or String, but specified as: ${depends}`)
      }
    }

    for (let dep of depends) {
      args.push("--depends", dep)
    }

    use(packager.appInfo.metadata.license || packager.devMetadata.license, it => args.push("--license", it!))
    use(appInfo.buildNumber, it => args.push("--iteration", it!))

    use(options.fpm, it => args.push(...<any>it))

    args.push(`${appOutDir}/=${installPrefix}/${appInfo.productFilename}`)
    args.push(...<any>(await this.packageFiles)!)
    await exec(await this.fpmPath, args)
  }

  private async computeDesktop(tempDir: string): Promise<Array<string>> {
    const appInfo = this.packager.appInfo
    const tempFile = path.join(tempDir, `${appInfo.productFilename}.desktop`)
    await outputFile(tempFile, this.packager.platformSpecificBuildOptions.desktop || `[Desktop Entry]
Name=${appInfo.productName}
Comment=${this.packager.platformSpecificBuildOptions.description || appInfo.description}
Exec="${installPrefix}/${appInfo.productFilename}/${appInfo.productFilename}"
Terminal=false
Type=Application
Icon=${appInfo.name}
`)
    return [`${tempFile}=/usr/share/applications/${appInfo.productFilename}.desktop`]
  }

  private async createFromIcns(tempDir: string): Promise<Array<string>> {
    const output = await exec("icns2png", ["-x", "-o", tempDir, path.join(this.packager.buildResourcesDir, "icon.icns")])
    debug(output)

    const imagePath = path.join(tempDir, "icon_256x256x32.png")

    function resize(size: number): BluebirdPromise<any> {
      const sizeArg = `${size}x${size}`
      return exec("gm", ["convert", "-size", sizeArg, imagePath, "-resize", sizeArg, path.join(tempDir, `icon_${size}x${size}x32.png`)])
    }

    const promises: Array<Promise<any>> = [resize(24), resize(96)]
    if (!output.includes("is32")) {
      promises.push(resize(16))
    }
    if (!output.includes("ih32")) {
      promises.push(resize(48))
    }
    if (!output.toString().includes("icp6")) {
      promises.push(resize(64))
    }
    if (!output.includes("it32")) {
      promises.push(resize(128))
    }

    await BluebirdPromise.all(promises)

    const appName = this.packager.appInfo.name

    function createMapping(size: string) {
      return `${tempDir}/icon_${size}x${size}x32.png=/usr/share/icons/hicolor/${size}x${size}/apps/${appName}.png`
    }

    return [
      createMapping("16"),
      createMapping("24"),
      createMapping("32"),
      createMapping("48"),
      createMapping("64"),
      createMapping("96"),
      createMapping("128"),
      createMapping("256"),
      createMapping("512"),
    ]
  }
}

async function writeConfigFile(tempDir: string, templatePath: string, options: any): Promise<string> {
  const config = template(await readFile(templatePath, "utf8"),
    {
      // set interpolate explicitly to avoid troubles with templating of installer.nsi.tpl
      interpolate: /<%=([\s\S]+?)%>/g
    })(options)

  const outputPath = path.join(tempDir, path.basename(templatePath, ".tpl"))
  await outputFile(outputPath, config)
  return outputPath
}