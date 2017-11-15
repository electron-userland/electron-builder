import BluebirdPromise from "bluebird-lst"
import { debug, exec, isEmptyOrSpaces, warn } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { outputFile, readdir } from "fs-extra-p"
import * as path from "path"
import { LinuxPackager } from "../linuxPackager"
import { LinuxConfiguration, LinuxTargetSpecificOptions } from "../options/linuxOptions"
import { getTemplatePath } from "../util/pathManager"

export const installPrefix = "/opt"

export interface IconInfo {
  file: string
  size: number
}

export class LinuxTargetHelper {
  readonly icons: Promise<Array<IconInfo>>

  maxIconPath: string | null = null

  constructor(private packager: LinuxPackager) {
    this.icons = this.computeDesktopIcons()
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIcons(): Promise<Array<IconInfo>> {
    const packager = this.packager
    const customIconSetDir = packager.platformSpecificBuildOptions.icon
    if (customIconSetDir != null) {
      let iconDir = path.resolve(packager.buildResourcesDir, customIconSetDir)
      const stat = await statOrNull(iconDir)
      if (stat == null || !stat.isDirectory()) {
        iconDir = path.resolve(packager.projectDir, customIconSetDir)
      }

      try {
        return await this.iconsFromDir(iconDir)
      }
      catch (e) {
        if (e.code === "ENOENT") {
          throw new Error(`Icon set directory ${iconDir} doesn't exist`)
        }
        else if (e.code === "ENOTDIR") {
          throw new Error(`linux.icon must be set to an icon set directory, but ${iconDir} is not a directory. Please see https://electron.build/configuration/configuration#LinuxBuildOptions-icon`)
        }
        else {
          throw e
        }
      }
    }

    const resourceList = await packager.resourceList
    if (resourceList.includes("icons")) {
      return await this.iconsFromDir(path.join(packager.buildResourcesDir, "icons"))
    }
    else {
      return await this.createFromIcns(await packager.info.tempDirManager.createTempDir({suffix: ".iconset"}))
    }
  }

  private async iconsFromDir(iconDir: string) {
    const mappings: Array<IconInfo> = []
    let maxSize = 0
    for (const file of (await readdir(iconDir))) {
      if (file.endsWith(".png") || file.endsWith(".PNG")) {
        // If parseInt encounters a character that is not a numeral in the specified radix,
        // it returns the integer value parsed up to that point
        try {
          const sizeString = file.match(/\d+/)
          const size = sizeString == null ? 0 : parseInt(sizeString[0], 10)
          if (size > 0) {
            const iconPath = `${iconDir}/${file}`
            mappings.push({
              file: iconPath,
              size,
            })

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

    if (mappings.length === 0) {
      throw new Error(`Icon set directory ${iconDir} doesn't contain icons`)
    }

    return mappings
  }

  private async getIcns(): Promise<string | null> {
    const build = this.packager.config
    let iconPath = (build.mac || {}).icon || build.icon
    if (iconPath != null && !iconPath.endsWith(".icns")) {
      iconPath += ".icns"
    }
    return iconPath == null ? await this.packager.getDefaultIcon("icns") : path.resolve(this.packager.projectDir, iconPath)
  }

  getDescription(options: LinuxConfiguration) {
    return options.description || this.packager.appInfo.description
  }

  async writeDesktopEntry(targetSpecificOptions: LinuxTargetSpecificOptions, exec?: string, destination?: string | null, extra?: { [key: string]: string; }): Promise<string> {
    const data = await this.computeDesktopEntry(targetSpecificOptions, exec, extra)
    const tempFile = destination || await this.packager.getTempFile(`${this.packager.appInfo.productFilename}.desktop`)
    await outputFile(tempFile, data)
    return tempFile
  }

  async computeDesktopEntry(targetSpecificOptions: LinuxTargetSpecificOptions, exec?: string, extra?: { [key: string]: string; }): Promise<string> {
    if (exec != null && exec.length === 0) {
      throw new Error("Specified exec is emptyd")
    }

    const appInfo = this.packager.appInfo

    const productFilename = appInfo.productFilename

    const desktopMeta: any = {
      Name: appInfo.productName,
      Comment: this.getDescription(targetSpecificOptions),
      Exec: exec == null ? `"${installPrefix}/${productFilename}/${this.packager.executableName}" %U` : exec,
      Terminal: "false",
      Type: "Application",
      Icon: this.packager.executableName,
      ...extra,
      ...targetSpecificOptions.desktop,
    }

    let category = targetSpecificOptions.category
    if (isEmptyOrSpaces(category)) {
      const macCategory = (this.packager.config.mac || {}).category
      if (macCategory != null) {
        category = macToLinuxCategory[macCategory]
      }

      if (category == null) {
        // https://github.com/develar/onshape-desktop-shell/issues/48
        let message = "Application category is not set for Linux (linux.category).\nPlease see https://electron.build/configuration/configuration#LinuxBuildOptions-category"
        if (macCategory != null) {
          message += `\n Cannot map mac category "${macCategory}" to Linux. If possible mapping is known for you, please file issue to add it.`
        }
        warn(message)
        category = "Utility"
      }
    }
    desktopMeta.Categories = `${category}${category.endsWith(";") ? "" : ";"}`

    let data = `[Desktop Entry]`
    for (const name of Object.keys(desktopMeta)) {
      const value = desktopMeta[name]
      data += `\n${name}=${value}`
    }
    data += "\n"
    return data
  }

  private async createFromIcns(tempDir: string): Promise<Array<IconInfo>> {
    const iconPath = await this.getIcns()
    if (iconPath == null) {
      return await this.iconsFromDir(path.join(getTemplatePath("linux"), "electron-icons"))
    }

    if (process.platform === "darwin") {
      await exec("iconutil", ["--convert", "iconset", "--output", tempDir, iconPath])
      const iconFiles = await readdir(tempDir)
      const imagePath = iconFiles.includes("icon_512x512.png") ? path.join(tempDir, "icon_512x512.png") : path.join(tempDir, "icon_256x256.png")
      this.maxIconPath = imagePath

      function resize(size: number): Promise<any> {
        const filename = `icon_${size}x${size}.png`
        return iconFiles.includes(filename) ? BluebirdPromise.resolve() : resizeImage(imagePath, path.join(tempDir, filename), size, size)
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
      const has256 = output.includes("ic08")
      const imagePath = path.join(tempDir, has256 ? "icon_256x256x32.png" : "icon_128x128x32.png")

      this.maxIconPath = imagePath

      function resize(size: number): Promise<any> {
        return resizeImage(imagePath, path.join(tempDir, `icon_${size}x${size}x32.png`), size, size)
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
      if (has256 && !output.includes("it32")) {
        promises.push(resize(128))
      }

      await BluebirdPromise.all(promises)

      return this.createMappings(tempDir)
    }
  }

  private createMappings(tempDir: string) {
    function createMapping(size: number): IconInfo {
      return {
        file: process.platform === "darwin" ? `${tempDir}/icon_${size}x${size}.png` : `${tempDir}/icon_${size}x${size}x32.png`,
        size,
      }
    }

    return [
      createMapping(16),
      createMapping(24),
      createMapping(32),
      createMapping(48),
      createMapping(64),
      createMapping(96),
      createMapping(128),
      createMapping(256),
      createMapping(512),
    ]
  }
}

const macToLinuxCategory: any = {
  "public.app-category.graphics-design": "Graphics",
  "public.app-category.developer-tools": "Development",
  "public.app-category.education": "Education",
  "public.app-category.games": "Game",
  "public.app-category.video": "Video;AudioVideo",
  "public.app-category.utilities": "Utility",
  "public.app-category.social-networking": "Chat",
}

function resizeImage(imagePath: string, result: string, w: number, h: number) {
  if (process.platform === "darwin") {
    return exec("sips", ["--resampleHeightWidth", h.toString(10), w.toString(10), imagePath, "--out", result])
  }
  else {
    const sizeArg = `${w}x${h}`
    return exec("gm", ["convert", "-size", sizeArg, imagePath, "-resize", sizeArg, result])
  }
}