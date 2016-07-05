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
    const tempDir = await this.tempDirPromise
    try {
      const mappings: Array<Array<string>> = []
      const pngIconsDir = path.join(this.packager.buildResourcesDir, "icons")
      let maxSize = 0
      for (let file of (await readdir(pngIconsDir))) {
        if (file.endsWith(".png") || file.endsWith(".PNG")) {
          // If parseInt encounters a character that is not a numeral in the specified radix,
          // it returns the integer value parsed up to that point
          try {
            const size = parseInt(file!, 10)
            if (size > 0) {
              const iconPath = `${pngIconsDir}/${file}`
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
    catch (e) {
      return this.createFromIcns(tempDir)
    }
  }

  async computeDesktopEntry(exec?: string): Promise<string> {
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
`)
    return tempFile
  }

  private async createFromIcns(tempDir: string): Promise<Array<Array<string>>> {
    const output = await exec("icns2png", ["-x", "-o", tempDir, path.join(this.packager.buildResourcesDir, "icon.icns")])
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