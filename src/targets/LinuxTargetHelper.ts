import { readdir, outputFile, ensureDir } from "fs-extra-p"
import * as path from "path"
import { exec, debug, isEmptyOrSpaces } from "../util/util"
import { PlatformPackager } from "../platformPackager"
import BluebirdPromise from "bluebird-lst-c"
import { LinuxBuildOptions } from "../metadata"

export const installPrefix = "/opt"

export class LinuxTargetHelper {
  readonly icons: Promise<Array<Array<string>>>

  maxIconPath: string | null = null

  constructor(private packager: PlatformPackager<LinuxBuildOptions>) {
    this.icons = this.computeDesktopIcons()
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIcons(): Promise<Array<Array<string>>> {
    const resourceList = await this.packager.resourceList
    if (resourceList.includes("icons")) {
      return this.iconsFromDir(path.join(this.packager.buildResourcesDir, "icons"))
    }
    else {
      return this.createFromIcns(await this.packager.getTempFile("electron-builder-linux.iconset").then(it => ensureDir(it).thenReturn(it)))
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

  async computeDesktopEntry(platformSpecificBuildOptions: LinuxBuildOptions, exec?: string, extra?: { [key: string]: string; }): Promise<string> {
    const appInfo = this.packager.appInfo

    const productFilename = appInfo.productFilename
    const tempFile = await this.packager.getTempFile(`${productFilename}.desktop`)

    const desktopMeta: any = Object.assign({
      Name: appInfo.productName,
      Comment: platformSpecificBuildOptions.description || appInfo.description,
      Exec: exec == null ? `"${installPrefix}/${productFilename}/${productFilename}"` : exec,
      Terminal: "false",
      Type: "Application",
      Icon: appInfo.name,
    }, extra, platformSpecificBuildOptions.desktop)

    const category = platformSpecificBuildOptions.category
    if (!isEmptyOrSpaces(category)) {
      desktopMeta.Categories = category
    }

    let data = `[Desktop Entry]`
    for (let name of Object.keys(desktopMeta)) {
      const value = desktopMeta[name]
      data += `\n${name}=${value}`
    }
    data += "\n"

    await outputFile(tempFile, data)
    return tempFile
  }

  private async createFromIcns(tempDir: string): Promise<Array<Array<string>>> {
    const iconPath = await this.getIcns()
    if (iconPath == null) {
      return this.iconsFromDir(path.join(__dirname, "..", "..", "templates", "linux", "electron-icons"))
    }

    if (process.platform === "darwin") {
      await exec("iconutil", ["--convert", "iconset", "--output", tempDir, iconPath])
      const iconFiles = await readdir(tempDir)
      const imagePath = iconFiles.includes("icon_512x512.png") ? path.join(tempDir, "icon_512x512.png") : path.join(tempDir, "icon_256x256.png")
      this.maxIconPath = imagePath

      function resize(size: number): BluebirdPromise<any> {
        const filename = `icon_${size}x${size}.png`

        if (iconFiles.includes(filename)) {
          return BluebirdPromise.resolve()
        }

        const sizeArg = `${size}x${size}`
        return exec("gm", ["convert", "-size", sizeArg, imagePath, "-resize", sizeArg, path.join(tempDir, filename)])
      }

      const promises: Array<Promise<any>> = [resize(24), resize(96)]
      promises.push(resize(16))
      promises.push(resize(48))
      promises.push(resize(64))
      promises.push(resize(128))
      await BluebirdPromise.all(promises)

      return this.createMappings(tempDir)
    }
    else {
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

      return this.createMappings(tempDir)
    }
  }

  private createMappings(tempDir: string) {
    const appName = this.packager.appInfo.name

    function createMapping(size: string) {
      return [process.platform === "darwin" ? `${tempDir}/icon_${size}x${size}.png` : `${tempDir}/icon_${size}x${size}x32.png`, `${size}x${size}/apps/${appName}.png`]
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