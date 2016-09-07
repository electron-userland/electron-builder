import { LinuxBuildOptions, Arch } from "../metadata"
import { smarten, PlatformPackager, TargetEx } from "../platformPackager"
import { use, exec } from "../util/util"
import * as path from "path"
import { downloadFpm } from "../util/binDownload"
import {  readFile, outputFile } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import { LinuxTargetHelper, installPrefix } from "./LinuxTargetHelper"
import * as errorMessages from "../errorMessages"
import { TmpDir } from "../util/tmp"

const template = require("lodash.template")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

const fpmPath = (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") ?
  BluebirdPromise.resolve("fpm") :
  downloadFpm(process.platform === "darwin" ? "1.5.1-20150715-2.2.2" : "1.5.0-2.3.1", process.platform === "darwin" ? "osx" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`)

export default class FpmTarget extends TargetEx {
  private readonly options = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.devMetadata.build)[this.name])

  private readonly scriptFiles: Promise<Array<string>>
  private readonly desktopEntry: Promise<string>

  constructor(name: string, private packager: PlatformPackager<LinuxBuildOptions>, private helper: LinuxTargetHelper, private outDir: string) {
    super(name)

    this.scriptFiles = this.createScripts()
    this.desktopEntry = helper.computeDesktopEntry(this.options)
  }

  private async createScripts(): Promise<Array<string>> {
    const defaultTemplatesDir = path.join(__dirname, "..", "..", "templates", "linux")

    const packager = this.packager
    const templateOptions = Object.assign({
      // old API compatibility
      executable: packager.appInfo.productFilename,
    }, packager.platformSpecificBuildOptions)

    function getResource(value: string | n, defaultFile: string) {
      if (value == null) {
        return path.join(defaultTemplatesDir, defaultFile)
      }
      return path.resolve(packager.projectDir, value)
    }

    const afterInstallFilePath = writeConfigFile(this.packager.info.tempDirManager, getResource(packager.platformSpecificBuildOptions.afterInstall, "after-install.tpl"), templateOptions)
    const afterRemoveFilePath = writeConfigFile(this.packager.info.tempDirManager, getResource(packager.platformSpecificBuildOptions.afterRemove, "after-remove.tpl"), templateOptions)

    return await BluebirdPromise.all<string>([afterInstallFilePath, afterRemoveFilePath])
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const target = this.name
    const destination = path.join(this.outDir, this.packager.generateName(target, arch, true /* on Linux we use safe name — without space */))

    const scripts = await this.scriptFiles
    const packager = this.packager
    const appInfo = packager.appInfo

    const projectUrl = await appInfo.computePackageUrl()
    if (projectUrl == null) {
      throw new Error("Please specify project homepage, see https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-homepage")
    }

    const options = this.options
    let author = options.maintainer
    if (author == null) {
      const a = appInfo.metadata.author!
      if (a.email == null) {
        throw new Error(errorMessages.authorEmailIsMissed)
      }
      author = `${a.name} <${a.email}>`
    }

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

    const packageCategory = options.packageCategory
    if (packageCategory != null && packageCategory !== null) {
      args.push("--category", packageCategory)
    }

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
    for (let mapping of (await this.helper.icons)) {
      args.push(mapping.join("=/usr/share/icons/hicolor/"))
    }

    args.push(`${await this.desktopEntry}=/usr/share/applications/${appInfo.productFilename}.desktop`)

    await exec(await fpmPath, args)

    this.packager.dispatchArtifactCreated(destination)
  }
}

async function writeConfigFile(tmpDir: TmpDir, templatePath: string, options: any): Promise<string> {
  const config = template(await readFile(templatePath, "utf8"),
    {
      // set interpolate explicitly to avoid troubles with templating of installer.nsi.tpl
      interpolate: /<%=([\s\S]+?)%>/g
    })(options)

  const outputPath = await tmpDir.getTempFile(path.basename(templatePath, ".tpl"))
  await outputFile(outputPath, config)
  return outputPath
}