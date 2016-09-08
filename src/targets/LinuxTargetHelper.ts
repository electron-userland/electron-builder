import { remove, emptyDir, readdir, outputFile } from "fs-extra-p"
import * as path from "path"
import { tmpdir } from "os"
import { getTempName, exec, debug } from "../util/util"
import { PlatformPackager } from "../platformPackager"
import { Promise as BluebirdPromise } from "bluebird"
import { LinuxBuildOptions } from "../metadata"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

export const installPrefix = "/opt"

export class LinuxTargetHelper {
  readonly icons: Promise<Array<Array<string>>>
  readonly tempDirPromise: Promise<string>

  maxIconPath: string | null = null

  constructor(private packager: PlatformPackager<LinuxBuildOptions>, cleanupTasks: Array<() => Promise<any>>) {
    const tempDir = path.join(tmpdir(), getTempName("electron-builder-linux"))
    this.tempDirPromise = emptyDir(tempDir)
      .then(() => {
        cleanupTasks.push(() => remove(tempDir))
        return tempDir
      })

    this.icons = this.computeDesktopIcons()
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIcons(): Promise<Array<Array<string>>> {
    const resourceList = await this.packager.resourceList
    if (resourceList.includes("icons")) {
      return this.iconsFromDir(path.join(this.packager.buildResourcesDir, "icons"))
    }
    else {
      return this.createFromIcns(await this.tempDirPromise)
    }
  }

  private async iconsFromDir(iconsDir: string) {
    const mappings: Array<Array<string>> = []
    let maxSize = 0
    for (let file of (await readdir(iconsDir))) {
      if (file.endsWith(".png") || file.endsWith(".PNG")) {
        // If parseInt encounters a character that is not a numeral in the specified radix,
        // it returns the integer value parsed up to that point
        try {
          const size = parseInt(file!, 10)
          if (size > 0) {
            const iconPath = `${iconsDir}/${file}`
            mappings.push([iconPath, `${size}x${size}/apps/${this.packager.appInfo.name}.png`])

            if (size > maxSize) {
              maxSize = size
              this.maxIconPath = iconPath
            }
          }
        }
        catch (e) {
          console.error(e)
        }
      }
    }
    return mappings
  }

  private async getIcns(): Promise<string | null> {
    const build = this.packager.devMetadata.build
    let iconPath = (build.mac || {}).icon || build.icon
    if (iconPath != null && !iconPath.endsWith(".icns")) {
      iconPath += ".icns"
    }
    return iconPath == null ? await this.packager.getDefaultIcon("icns") : path.resolve(this.packager.projectDir, iconPath)
  }

  async computeDesktopEntry(exec?: string, extra?: string): Promise<string> {
    const appInfo = this.packager.appInfo

    const custom = this.packager.platformSpecificBuildOptions.desktop
    if (custom != null) {
      return custom
    }

    const productFilename = appInfo.productFilename
    const tempFile = path.join(await this.tempDirPromise, `${productFilename}.desktop`)
    await outputFile(tempFile, this.packager.platformSpecificBuildOptions.desktop || `[Desktop Entry]
Name=${appInfo.productName}
Comment=${this.packager.platformSpecificBuildOptions.description || appInfo.description}
Exec=${(exec == null ? `"${installPrefix}/${productFilename}/${productFilename}"` : exec)}
Terminal=false
Type=Application
Icon=${appInfo.name}
${extra == null ? "" : `${extra}\n`}`)
    return tempFile
  }

  private async createFromIcns(tempDir: string): Promise<Array<Array<string>>> {
    const iconPath = await this.getIcns()
    if (iconPath == null) {
      return this.iconsFromDir(path.join(__dirname, "..", "..", "templates", "linux", "electron-icons"))
    }

    const output = await exec("icns2png", ["-x", "-o", tempDir, iconPath])
    debug(output)

    //noinspection UnnecessaryLocalVariableJS
    const imagePath = path.join(tempDir, "icon_256x256x32.png")

    this.maxIconPath = imagePath

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
      return [`${tempDir}/icon_${size}x${size}x32.png`, `${size}x${size}/apps/${appName}.png`]
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