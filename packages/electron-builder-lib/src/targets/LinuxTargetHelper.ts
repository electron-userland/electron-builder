import { exec, isEmptyOrSpaces, log } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { outputFile, readdir } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { LinuxConfiguration, LinuxTargetSpecificOptions } from ".."
import { LinuxPackager } from "../linuxPackager"
import { getTemplatePath } from "../util/pathManager"
import { getAppBuilderTool } from "./tools"

export const installPrefix = "/opt"

export interface IconInfo {
  file: string
  size: number
}

export class LinuxTargetHelper {
  private readonly iconPromise = new Lazy(() => this.computeDesktopIcons())

  maxIconPath: string | null = null

  constructor(private packager: LinuxPackager) {
  }

  get icons(): Promise<Array<IconInfo>> {
    return this.iconPromise.value
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIcons(): Promise<Array<IconInfo>> {
    const packager = this.packager
    const customIconSetDir = packager.platformSpecificBuildOptions.icon
    if (customIconSetDir != null) {
      let iconDir = path.resolve(packager.info.buildResourcesDir, customIconSetDir)
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
      return await this.iconsFromDir(path.join(packager.info.buildResourcesDir, "icons"))
    }
    else {
      return await this.createFromIcns()
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
    const build = this.packager.info.config
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
      throw new Error("Specified exec is empty")
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
        if (macCategory != null) {
          log.warn({macCategory}, "cannot map macOS category to Linux. If possible mapping is known for you, please file issue to add it.")
        }
        log.warn({
          reason: "linux.category is not set and cannot map from macOS",
          docs: "https://electron.build/configuration/configuration#LinuxBuildOptions-category",
        }, "application Linux category is set to default \"Utility\"")
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

  private async createFromIcns(): Promise<Array<IconInfo>> {
    const iconPath = await this.getIcns()
    if (iconPath == null) {
      return await this.iconsFromDir(path.join(getTemplatePath("linux"), "electron-icons"))
    }

    const result = JSON.parse(await exec(await getAppBuilderTool(), ["icns-to-png", "--input", iconPath]))
    this.maxIconPath = result.maxIconPath
    return result.icons
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
  "public.app-category.finance": "Finance",
}