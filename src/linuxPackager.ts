import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform } from "./metadata"
import { dir as _tpmDir, TmpOptions } from "tmp"
import { exec, log } from "./util"
import { State as Gm } from "gm"
import { outputFile, readFile } from "fs-extra-p"
const template = require("lodash.template")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const tmpDir = BluebirdPromise.promisify(<(config: TmpOptions, callback: (error: Error, path: string, cleanupCallback: () => void) => void) => void>_tpmDir)

export class LinuxPackager extends PlatformPackager<DebOptions> {
  private readonly debOptions: DebOptions

  private readonly packageFiles: Promise<Array<string>>
  private readonly scriptFiles: Promise<Array<string>>

  constructor(info: BuildInfo) {
    super(info)

    this.debOptions = Object.assign({
      name: this.metadata.name,
      comment: this.metadata.description,
    }, this.customDistOptions)

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
    if (this.customDistOptions == null || this.customDistOptions.desktop == null) {
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

  private async computeDesktopIconPath(tempDir: string): Promise<Array<string>> {
    const outputs = await exec("icns2png", ["-x", "-o", tempDir, path.join(this.buildResourcesDir, "icon.icns")])
    if (!outputs[0].toString().includes("ih32")) {
      log("48x48 is not found in the icns, 128x128 will be resized")
      // icns doesn't contain required 48x48, use gm to resize
      await new BluebirdPromise((resolve, reject) => {
        (<Gm>require("gm")(path.join(tempDir, "icon_128x128x32.png")))
          .resize(48, 48)
          .write(path.join(tempDir, "icon_48x48x32.png"), error => error == null ? resolve() : reject(error))
      })
    }

    const name = this.metadata.name

    function createMapping(size: string) {
      return `${tempDir}/icon_${size}x${size}x32.png=/usr/share/icons/hicolor/${size}x${size}/apps/${name}.png`
    }

    return [
      createMapping("16"),
      createMapping("32"),
      createMapping("48"),
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

  private async buildDeb(options: DebOptions, outDir: string, appOutDir: string, arch: string): Promise<string> {
    const archName = arch === "ia32" ? "i386" : "amd64"
    const target = "deb"
    const outFilename = `${this.metadata.name}-${this.metadata.version}-${archName}.${target}`
    const destination = path.join(outDir, outFilename)
    const scripts = await this.scriptFiles
    await exec("fpm", [
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
      "--deb-compression", options.compression || "xz",
      appOutDir + "/=/opt/" + this.appName,
    ].concat(await this.packageFiles))
    return outFilename
  }
}

async function writeConfigFile(tempDir: string, templatePath: string, options: any): Promise<string> {
  const config = template(await readFile(templatePath, "utf8"),
    {
      // set interpolate explicitely to avoid troubles with templating of installer.nsi.tpl
      interpolate: /<%=([\s\S]+?)%>/g
    })(options)

  const outputPath = path.join(tempDir, path.basename(templatePath, ".tpl"))
  await outputFile(outputPath, config)
  return outputPath
}

export interface DebOptions {
  name: string
  comment: string

  maintainer: string

  /**
   * .desktop file template
   */
  desktop?: string

  afterInstall?: string
  afterRemove?: string

  compression?: string
}