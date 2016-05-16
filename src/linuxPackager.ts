import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform, LinuxBuildOptions } from "./metadata"
import { dir as _tpmDir, TmpOptions } from "tmp"
import { exec, log, use } from "./util"
import { outputFile, readFile, readdir } from "fs-extra-p"
import { downloadFpm } from "./fpmDownload"
const template = require("lodash.template")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const tmpDir = BluebirdPromise.promisify(<(config: TmpOptions, callback: (error: Error, path: string, cleanupCallback: () => void) => void) => void>_tpmDir)
const installPrefix = "/opt"

export class LinuxPackager extends PlatformPackager<LinuxBuildOptions> {
  private readonly debOptions: LinuxBuildOptions

  private readonly packageFiles: Promise<Array<string>>
  private readonly scriptFiles: Promise<Array<string>>

  private readonly fpmPath: Promise<string>

  constructor(info: BuildInfo) {
    super(info)

    this.debOptions = Object.assign({
      name: this.metadata.name,
      description: this.metadata.description,
    }, this.customBuildOptions)

    if (this.options.dist) {
      const tempDir = tmpDir({
        unsafeCleanup: true,
        prefix: "electron-builder-"
      })
      this.packageFiles = this.computePackageFiles(tempDir)
      this.scriptFiles = this.createScripts(tempDir)

      if (process.platform !== "win32" && process.env.USE_SYSTEM_FPM !== "true") {
        this.fpmPath = downloadFpm(process.platform === "darwin" ? "1.5.0-1" : "1.5.0-2.3.1", process.platform === "darwin" ? "osx" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`)
      }
      else {
        this.fpmPath = BluebirdPromise.resolve("fpm")
      }
    }
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

  async pack(outDir: string, arch: string, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(this.computePackOptions(outDir, arch), outDir, appOutDir, arch, this.customBuildOptions)

    if (this.options.dist) {
      postAsyncTasks.push(this.packageInDistributableFormat(outDir, appOutDir, arch))
    }
  }

  private async computeDesktop(tempDir: string): Promise<Array<string>> {
    const tempFile = path.join(tempDir, this.appName + ".desktop")
    await outputFile(tempFile, this.debOptions.desktop || `[Desktop Entry]
Name=${this.appName}
Comment=${this.debOptions.description}
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
    const outputs = await exec("icns2png", ["-x", "-o", tempDir, path.join(this.buildResourcesDir, "icon.icns")])
    const output = outputs[0].toString()
    log(output)

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
    }, this.debOptions)

    const afterInstallTemplate = this.debOptions.afterInstall || path.join(defaultTemplatesDir, "after-install.tpl")
    const afterInstallFilePath = writeConfigFile(tempDir, afterInstallTemplate, templateOptions)

    const afterRemoveTemplate = this.debOptions.afterRemove || path.join(defaultTemplatesDir, "after-remove.tpl")
    const afterRemoveFilePath = writeConfigFile(tempDir, afterRemoveTemplate, templateOptions)

    return await BluebirdPromise.all<string>([afterInstallFilePath, afterRemoveFilePath])
  }

  async packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any> {
    return await this.buildDeb(this.debOptions, outDir, appOutDir, arch)
      .then(it => this.dispatchArtifactCreated(it))
  }

  private async buildDeb(options: LinuxBuildOptions, outDir: string, appOutDir: string, arch: string): Promise<string> {
    const archName = arch === "ia32" ? "i386" : "amd64"
    const target = "deb"
    const destination = path.join(outDir, `${this.metadata.name}-${this.metadata.version}-${archName}.${target}`)
    const scripts = await this.scriptFiles

    const projectUrl = await this.computePackageUrl()
    if (projectUrl == null) {
      throw new Error("Please specify project homepage, see https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata-homepage")
    }

    const author = options.maintainer || `${this.metadata.author.name} <${this.metadata.author.email}>`
    const args = [
      "-s", "dir",
      "-t", target,
      "--architecture", archName,
      "--rpm-os", "linux",
      "--name", this.metadata.name,
      "--force",
      "--after-install", scripts[0],
      "--after-remove", scripts[1],
      "--description", `${options.synopsis || ""}\n ${this.debOptions.description}`,
      "--maintainer", author,
      "--vendor", options.vendor || author,
      "--version", this.metadata.version,
      "--package", destination,
      "--deb-compression", options.compression || (this.devMetadata.build.compression === "store" ? "gz" : "xz"),
      "--url", projectUrl,
    ]

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
    return destination
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
