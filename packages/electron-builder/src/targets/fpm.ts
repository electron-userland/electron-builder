import BluebirdPromise from "bluebird-lst"
import { exec, smarten, TmpDir, use } from "electron-builder-util"
import { getBin } from "electron-builder-util/out/binDownload"
import { unlinkIfExists } from "electron-builder-util/out/fs"
import { log, warn } from "electron-builder-util/out/log"
import { ensureDir, outputFile, readFile } from "fs-extra-p"
import * as path from "path"
import { Arch, Target, toLinuxArchString } from "../core"
import * as errorMessages from "../errorMessages"
import { LinuxPackager } from "../linuxPackager"
import { DebOptions, LinuxTargetSpecificOptions } from "../options/linuxOptions"
import { installPrefix, LinuxTargetHelper } from "./LinuxTargetHelper"

const fpmPath = (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") ?
  BluebirdPromise.resolve("fpm") : downloadFpm()

// can be called in parallel, all calls for the same version will get the same promise - will be downloaded only once
function downloadFpm(): Promise<string> {
  const version = process.platform === "darwin" ? "fpm-1.8.1-20150715-2.2.2" : "fpm-1.8.1-2.3.1"
  const osAndArch = process.platform === "darwin" ? "mac" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`
  //noinspection SpellCheckingInspection
  const sha2 = process.platform === "darwin" ? "97352e184a1f54e5ed0d12f38ac383edebbe421db5a3fb59898e8c9a1c407ed7" :
    (process.arch === "ia32" ? "8380331f7d9762a36d7c7181501c3fc9342745b8499b962f6ea37c7dc3778f99" : "6538fcd2486c2831949562abfd0017b67eff502addad5b444baec4899b0babc6")

  return getBin("fpm", version, `https://dl.bintray.com/electron-userland/bin/${version}-${osAndArch}.7z`, sha2)
    .then(it => path.join(it, "fpm"))
}

export default class FpmTarget extends Target {
  readonly options: LinuxTargetSpecificOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, (<any>this.packager.config)[this.name])

  private readonly scriptFiles: Promise<Array<string>>

  constructor(name: string, private readonly packager: LinuxPackager, private readonly helper: LinuxTargetHelper, readonly outDir: string) {
    super(name, false)

    this.scriptFiles = this.createScripts()
  }

  private async createScripts(): Promise<Array<string>> {
    const defaultTemplatesDir = path.join(__dirname, "..", "..", "templates", "linux")

    const packager = this.packager
    const templateOptions = Object.assign({
      // old API compatibility
      executable: packager.executableName,
      productFilename: packager.appInfo.productFilename,
    }, packager.platformSpecificBuildOptions)

    function getResource(value: string | n, defaultFile: string) {
      if (value == null) {
        return path.join(defaultTemplatesDir, defaultFile)
      }
      return path.resolve(packager.projectDir, value)
    }

    //noinspection ES6MissingAwait
    return await BluebirdPromise.all<string>([
      writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterInstall, "after-install.tpl"), templateOptions),
      writeConfigFile(packager.info.tempDirManager, getResource(this.options.afterRemove, "after-remove.tpl"), templateOptions)
    ])
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const target = this.name

    log(`Building ${target}`)

    let nameFormat = "${name}-${version}-${arch}.${ext}"
    let isUseArchIfX64 = false
    if (target === "deb") {
      nameFormat = "${name}_${version}_${arch}.${ext}"
      isUseArchIfX64 = true
    }
    else if (target === "rpm") {
      nameFormat = "${name}-${version}.${arch}.${ext}"
      isUseArchIfX64 = true
    }

    const destination = path.join(this.outDir, this.packager.expandArtifactNamePattern(this.options, target, arch, nameFormat, !isUseArchIfX64))
    await unlinkIfExists(destination)
    if (this.packager.info.prepackaged != null) {
      await ensureDir(this.outDir)
    }

    const scripts = await this.scriptFiles
    const packager = this.packager
    const appInfo = packager.appInfo

    const projectUrl = await appInfo.computePackageUrl()
    if (projectUrl == null) {
      throw new Error("Please specify project homepage, see https://github.com/electron-userland/electron-builder/wiki/Options#Metadata-homepage")
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
      "--architecture", (target === "pacman" && arch === Arch.ia32) ? "i686" : toLinuxArchString(arch),
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
      args.push("--deb-compression", (<DebOptions>options).compression || (packager.config.compression === "store" ? "gz" : "xz"))
      use((<DebOptions>options).priority, it => args.push("--deb-priority", it!))
    }
    else if (target === "rpm") {
      args.push("--rpm-os", "linux")

      if (synopsis != null) {
        args.push("--rpm-summary", smarten(synopsis))
      }
    }

    // noinspection JSDeprecatedSymbols
    let depends = options.depends || this.packager.platformSpecificBuildOptions.depends
    if (depends == null) {
      if (target === "deb") {
        depends = ["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3", "libxss1"]
      }
      else if (target === "pacman") {
        // noinspection SpellCheckingInspection
        depends = ["c-ares", "ffmpeg", "gtk3", "http-parser", "libevent", "libvpx", "libxslt", "libxss", "minizip", "nss", "re2", "snappy", "libnotify", "libappindicator-gtk2", "libappindicator-gtk3", "libappindicator-sharp"]
      }
      else if (target === "rpm") {
        depends = ["libnotify", "libappindicator"]
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

    for (const dep of depends) {
      args.push("--depends", dep)
    }

    use(packager.appInfo.metadata.license, it => args.push("--license", it!))
    use(appInfo.buildNumber, it => args.push("--iteration", it!))

    use(options.fpm, it => args.push(...<any>it))

    args.push(`${appOutDir}/=${installPrefix}/${appInfo.productFilename}`)
    for (const mapping of (await this.helper.icons)) {
      args.push(mapping.join("=/usr/share/icons/hicolor/"))
    }

    const desktopFilePath = await this.helper.computeDesktopEntry(this.options)
    args.push(`${desktopFilePath}=/usr/share/applications/${this.packager.executableName}.desktop`)

    if (this.packager.packagerOptions.effectiveOptionComputed != null && await this.packager.packagerOptions.effectiveOptionComputed([args, desktopFilePath])) {
      return
    }

    await exec(await fpmPath, args)

    this.packager.dispatchArtifactCreated(destination, this, arch)
  }
}

async function writeConfigFile(tmpDir: TmpDir, templatePath: string, options: any): Promise<string> {
  //noinspection JSUnusedLocalSymbols
  function replacer(match: string, p1: string) {
    if (p1 in options) {
      return options[p1]
    }
    else {
      throw new Error(`Macro ${p1} is not defined`)
    }
  }
  const config = (await readFile(templatePath, "utf8"))
    .replace(/\$\{([a-zA-Z]+)\}/g, replacer)
    .replace(/<%=([a-zA-Z]+)%>/g, (match, p1) => {
      warn("<%= varName %> is deprecated, please use ${varName} instead")
      return replacer(match, p1.trim())
    })

  const outputPath = await tmpDir.getTempFile(path.basename(templatePath, ".tpl"))
  await outputFile(outputPath, config)
  return outputPath
}
