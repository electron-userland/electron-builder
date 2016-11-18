import { Arch } from "../metadata"
import { smarten, Target } from "../platformPackager"
import { use, exec } from "../util/util"
import * as path from "path"
import { getBin } from "../util/binDownload"
import {  readFile, outputFile } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import { LinuxTargetHelper, installPrefix } from "./LinuxTargetHelper"
import * as errorMessages from "../errorMessages"
import { TmpDir } from "../util/tmp"
import { LinuxPackager } from "../linuxPackager"
import { log } from "../util/log"

const template = require("lodash.template")

const fpmPath = (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") ?
  BluebirdPromise.resolve("fpm") : downloadFpm()

// can be called in parallel, all calls for the same version will get the same promise - will be downloaded only once
function downloadFpm(): Promise<string> {
  const version = process.platform === "darwin" ? "fpm-1.6.3-20150715-2.2.2" : "fpm-1.6.3-2.3.1"
  const osAndArch = process.platform === "darwin" ? "mac" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`
  //noinspection SpellCheckingInspection
  const sha2 = process.platform === "darwin" ? "1b13080ecfd2b6fddb984ed6e1dfcb38cdf5b051a04d609c2a95227ed9a5ecbc" :
    (process.arch === "ia32" ? "b55f25749a27097140171f073466c52e59f733a275fea99e2334c540627ffc62" : "4c6fc529e996f7ff850da2d0bb6c85080e43be672494b14c0c6bdcc03bf57328")

  return getBin("fpm", version, `https://dl.bintray.com/electron-userland/bin/${version}-${osAndArch}.7z`, sha2)
    .then(it => path.join(it, "fpm"))
}

export default class FpmTarget extends Target {
  private readonly options = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.devMetadata.build)[this.name])

  private readonly scriptFiles: Promise<Array<string>>
  private readonly desktopEntry: Promise<string>

  constructor(name: string, private packager: LinuxPackager, private helper: LinuxTargetHelper, private outDir: string) {
    super(name, false)

    this.scriptFiles = this.createScripts()
    this.desktopEntry = helper.computeDesktopEntry(this.options)
  }

  private async createScripts(): Promise<Array<string>> {
    const defaultTemplatesDir = path.join(__dirname, "..", "..", "templates", "linux")

    const packager = this.packager
    const templateOptions = Object.assign({
      // old API compatibility
      executable: this.packager.executableName,
    }, packager.platformSpecificBuildOptions)

    function getResource(value: string | n, defaultFile: string) {
      if (value == null) {
        return path.join(defaultTemplatesDir, defaultFile)
      }
      return path.resolve(packager.projectDir, value)
    }

    //noinspection ES6MissingAwait
    return await BluebirdPromise.all<string>([
      writeConfigFile(packager.info.tempDirManager, getResource(packager.platformSpecificBuildOptions.afterInstall, "after-install.tpl"), templateOptions),
      writeConfigFile(packager.info.tempDirManager, getResource(packager.platformSpecificBuildOptions.afterRemove, "after-remove.tpl"), templateOptions)
    ])
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const target = this.name

    log(`Building ${target}`)

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
      "--architecture", arch === Arch.ia32 ? "i386" : (arch === Arch.x64 ? "amd64" : "armv7l"),
      "--name", appInfo.name,
      "--force",
      "--after-install", scripts[0],
      "--after-remove", scripts[1],
      "--description", smarten(target === "rpm" ? this.helper.getDescription(options)! : `${synopsis || ""}\n ${this.helper.getDescription(options)}`),
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