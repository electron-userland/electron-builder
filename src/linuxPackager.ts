import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo, smarten, getArchSuffix } from "./platformPackager"
import { Platform, LinuxBuildOptions, Arch } from "./metadata"
import { exec, debug, use, getTempName } from "./util"
import { outputFile, readFile, remove, readdir, emptyDir } from "fs-extra-p"
import { downloadFpm } from "./fpmDownload"
import { tmpdir } from "os"
const template = require("lodash.template")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const installPrefix = "/opt"

export class LinuxPackager extends PlatformPackager<LinuxBuildOptions> {
  private readonly buildOptions: LinuxBuildOptions

  private readonly packageFiles: Promise<Array<string>>
  private readonly scriptFiles: Promise<Array<string>>

  private readonly fpmPath: Promise<string>

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info)

    this.buildOptions = Object.assign({
      name: this.metadata.name,
      description: this.metadata.description,
    }, this.customBuildOptions)

    if (!this.hasOnlyDirTarget()) {
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
  }

  protected get supportedTargets(): Array<string> {
    return ["deb", "rpm", "sh", "freebsd", "pacman", "apk", "p5p"]
  }

  get platform() {
    return Platform.LINUX
  }

  private async computePackageFiles(tempDirPromise: Promise<string>): Promise<Array<string>> {
    const tempDir = await tempDirPromise

    const promises: Array<Promise<Array<string>>> = []
    if (this.customBuildOptions.desktop == null) {
      promises.push(this.computeDesktopIconPath(tempDir))
    }

    promises.push(this.computeDesktop(tempDir))

    return [].concat(...await BluebirdPromise.all(promises))
  }

  async pack(outDir: string, arch: Arch, targets: Array<string>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(this.computePackOptions(outDir, appOutDir, arch), outDir, appOutDir, arch, this.customBuildOptions)

    postAsyncTasks.push(this.packageInDistributableFormat(outDir, appOutDir, arch, targets))
  }

  private async computeDesktop(tempDir: string): Promise<Array<string>> {
    const tempFile = path.join(tempDir, this.appName + ".desktop")
    await outputFile(tempFile, this.buildOptions.desktop || `[Desktop Entry]
Name=${this.appName}
Comment=${this.buildOptions.description}
Exec="${installPrefix}/${this.appName}/${this.appName}"
Terminal=false
Type=Application
Icon=${this.metadata.name}
`)
    return [`${tempFile}=/usr/share/applications/${this.appName}.desktop`]
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIconPath(tempDir: string): Promise<Array<string>> {
    try {
      const mappings: Array<string> = []
      const pngIconsDir = path.join(this.buildResourcesDir, "icons")
      for (let file of (await readdir(pngIconsDir))) {
        if (file!.endsWith(".png") || file!.endsWith(".PNG")) {
          // If parseInt encounters a character that is not a numeral in the specified radix,
          // it returns the integer value parsed up to that point
          try {
            const size = parseInt(file!, 10)
            if (size > 0) {
              mappings.push(`${pngIconsDir}/${file}=/usr/share/icons/hicolor/${size}x${size}/apps/${this.metadata.name}.png`)
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

  private async createFromIcns(tempDir: string): Promise<Array<string>> {
    const output = await exec("icns2png", ["-x", "-o", tempDir, path.join(this.buildResourcesDir, "icon.icns")])
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

    const appName = this.metadata.name

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

  private async createScripts(tempDirPromise: Promise<string>): Promise<Array<string>> {
    const tempDir = await tempDirPromise
    const defaultTemplatesDir = path.join(__dirname, "..", "templates", "linux")

    const templateOptions = Object.assign({
      // old API compatibility
      executable: this.appName,
    }, this.buildOptions)

    const afterInstallTemplate = this.buildOptions.afterInstall || path.join(defaultTemplatesDir, "after-install.tpl")
    const afterInstallFilePath = writeConfigFile(tempDir, afterInstallTemplate, templateOptions)

    const afterRemoveTemplate = this.buildOptions.afterRemove || path.join(defaultTemplatesDir, "after-remove.tpl")
    const afterRemoveFilePath = writeConfigFile(tempDir, afterRemoveTemplate, templateOptions)

    return await BluebirdPromise.all<string>([afterInstallFilePath, afterRemoveFilePath])
  }

  protected async packageInDistributableFormat(outDir: string, appOutDir: string, arch: Arch, targets: Array<string>): Promise<any> {
    // todo fix fpm - if run in parallel, get strange tar errors
    for (let target of targets) {
      target = target === "default" ? "deb" : target
      if (target !== "dir" && target !== "zip" && target !== "7z" && !target.startsWith("tar.")) {
        const destination = path.join(outDir, `${this.metadata.name}-${this.metadata.version}${getArchSuffix(arch)}.${target}`)
        await this.buildPackage(destination, target, this.buildOptions, appOutDir, arch)
        this.dispatchArtifactCreated(destination)
      }
    }

    const promises: Array<Promise<any>> = []
    // https://github.com/electron-userland/electron-builder/issues/460
    // for some reasons in parallel to fmp we cannot use tar
    for (let target of targets) {
      if (target === "zip" || target === "7z" || target.startsWith("tar.")) {
        const destination = path.join(outDir, `${this.metadata.name}-${this.metadata.version}${getArchSuffix(arch)}.${target}`)
        promises.push(this.archiveApp(target, appOutDir, destination)
          .then(() => this.dispatchArtifactCreated(destination)))
      }
    }

    if (promises.length > 0) {
      await BluebirdPromise.all(promises)
    }
  }

  private async buildPackage(destination: string, target: string, options: LinuxBuildOptions, appOutDir: string, arch: Arch): Promise<any> {
    const scripts = await this.scriptFiles

    const projectUrl = await this.computePackageUrl()
    if (projectUrl == null) {
      throw new Error("Please specify project homepage, see https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-homepage")
    }

    const author = options.maintainer || `${this.metadata.author.name} <${this.metadata.author.email}>`
    const synopsis = options.synopsis
    const args = [
      "-s", "dir",
      "-t", target,
      "--architecture", arch === Arch.ia32 ? "i386" : "amd64",
      "--name", this.metadata.name,
      "--force",
      "--after-install", scripts[0],
      "--after-remove", scripts[1],
      "--description", smarten(target === "rpm" ? this.buildOptions.description! : `${synopsis || ""}\n ${this.buildOptions.description}`),
      "--maintainer", author,
      "--vendor", options.vendor || author,
      "--version", this.metadata.version,
      "--package", destination,
      "--url", projectUrl,
    ]

    if (target === "deb") {
      args.push("--deb-compression", options.compression || (this.devMetadata.build.compression === "store" ? "gz" : "xz"))
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
      depends = ["libappindicator1", "libnotify-bin"]
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

    use(this.metadata.license || this.devMetadata.license, it => args.push("--license", it!))
    use(this.computeBuildNumber(), it => args.push("--iteration", it!))

    use(options.fpm, it => args.push(...<any>it))

    args.push(`${appOutDir}/=${installPrefix}/${this.appName}`)
    args.push(...<any>(await this.packageFiles)!)
    await exec(await this.fpmPath, args)
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
