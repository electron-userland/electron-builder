import { isEmptyOrSpaces, log } from "builder-util"
import { outputFile } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { LinuxTargetSpecificOptions } from ".."
import { LinuxPackager } from "../linuxPackager"
import { IconInfo } from "../platformPackager"
import { getTemplatePath } from "../util/pathManager"

export const installPrefix = "/opt"

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
    const iconDir = packager.platformSpecificBuildOptions.icon
    const sources = [iconDir == null ? "icons" : iconDir]

    const commonConfiguration = packager.config
    let icnsPath = (commonConfiguration.mac || {}).icon || commonConfiguration.icon
    if (icnsPath != null) {
      if (!icnsPath.endsWith(".icns")) {
        icnsPath += ".icns"
      }
      sources.push(icnsPath)
    }

    sources.push("icon.icns")

    sources.push(path.join(getTemplatePath("linux"), "electron-icons"))

    const result = await packager.resolveIcon(sources, "set")
    this.maxIconPath = result[result.length - 1].file
    return result
  }

  getDescription(options: LinuxTargetSpecificOptions) {
    return options.description || this.packager.appInfo.description
  }

  async writeDesktopEntry(targetSpecificOptions: LinuxTargetSpecificOptions, exec?: string, destination?: string | null, extra?: { [key: string]: string; }): Promise<string> {
    const data = await this.computeDesktopEntry(targetSpecificOptions, exec, extra)
    const file = destination || await this.packager.getTempFile(`${this.packager.appInfo.productFilename}.desktop`)
    await outputFile(file, data)
    return file
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