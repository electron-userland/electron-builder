import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform, LinuxBuildOptions } from "./metadata"
import { dir as _tpmDir, TmpOptions } from "tmp"
import { exec, log } from "./util"
import { outputFile, readFile, readdir } from "fs-extra-p"
const template = require("lodash.template")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const tmpDir = BluebirdPromise.promisify(<(config: TmpOptions, callback: (error: Error, path: string, cleanupCallback: () => void) => void) => void>_tpmDir)

export class LinuxPackager extends PlatformPackager<LinuxBuildOptions> {
  private readonly debOptions: LinuxBuildOptions

  private readonly packageFiles: Promise<Array<string>>
  private readonly scriptFiles: Promise<Array<string>>

  constructor(info: BuildInfo) {
    super(info)

    this.debOptions = Object.assign({
      name: this.metadata.name,
      comment: this.metadata.description,
    }, this.customBuildOptions)

    if (this.options.dist) {
      const tempDir = tmpDir({
        unsafeCleanup: true,
        prefix: "electron-builder-"
      })
      this.packageFiles = this.computePackageFiles(tempDir)
      this.scriptFiles = this.createScripts(tempDir)
    }
  }

  protected get platform() {
    return Platform.LINUX
  }

  private async computePackageFiles(tempDirPromise: Promise<string>): Promise<Array<string>> {
    const tempDir = await tempDirPromise

    const promises: Array<Promise<Array<string>>> = []
    if (this.customBuildOptions == null || this.customBuildOptions.desktop == null) {
      promises.push(this.computeDesktopIconPath(tempDir))
    }

    promises.push(this.computeDesktop(tempDir))

    return Array.prototype.concat.apply([], await BluebirdPromise.all(promises))
  }

  private async computeDesktop(tempDir: string): Promise<Array<string>> {
    const tempFile = path.join(tempDir, this.appName + ".desktop")
    await outputFile(tempFile, this.debOptions.desktop || `[Desktop Entry]
Name=${this.appName}
Comment=${this.debOptions.comment}
Exec="${this.appName}"
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
        if (file.endsWith(".png") || file.endsWith(".PNG")) {
          // If parseInt encounters a character that is not a numeral in the specified radix,
          // it returns the integer value parsed up to that point
          try {
            const size = parseInt(file, 10)
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
      throw new Error("Please specify project homepage")
    }

    const args = [
      "-s", "dir",
      "-t", target,
      "--architecture", archName,
      "--rpm-os", "linux",
      "--name", this.metadata.name,
      "--force",
      "--after-install", scripts[0],
      "--after-remove", scripts[1],
      "--description", options.comment,
      "--maintainer", options.maintainer || `${this.metadata.author.name} <${this.metadata.author.email}>`,
      "--version", this.metadata.version,
      "--package", destination,
      "--deb-compression", options.compression || (this.devMetadata.build.compression === "store" ? "gz" : "xz"),
      "--url", projectUrl,
    ]

    use(this.devMetadata.license, it => args.push("--license", it))
    use(this.computeBuildNumber(), it => args.push("--iteration", it))

    args.push(`${appOutDir}/=/opt/${this.appName}`)
    args.push(...(await this.packageFiles))
    await exec("fpm", args)
    return destination
  }
}

function use<T>(value: T, task: (it: T) => void) {
  if (value != null) {
    task(value)
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