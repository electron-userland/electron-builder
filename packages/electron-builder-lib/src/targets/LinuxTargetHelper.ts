import { exec, isEmptyOrSpaces, log } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { ExecFileOptions } from "child_process"
import { outputFile } from "fs-extra-p"
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

export interface IconListResult {
  maxIconPath: string
  readonly icons: Array<IconInfo>
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
    const execOptions: ExecFileOptions = {
      env: {
        ...process.env,
        // icns-to-png creates temp dir amd cannot delete it automatically since result files located in and it is our responsibility remove it after use,
        // so, we just set TMPDIR to tempDirManager.rootTempDir and tempDirManager in any case will delete rootTempDir on exit
        TMPDIR: await this.packager.info.tempDirManager.rootTempDir,
      },
    }

    async function collectIcons(sourceDir: string) {
      return JSON.parse(await exec(await getAppBuilderTool(), ["collect-icons", "--source", sourceDir], execOptions))
    }

    let iconDir = packager.platformSpecificBuildOptions.icon
    if (iconDir != null) {
      const iconDirCandidate = path.resolve(packager.info.buildResourcesDir, iconDir)
      if (await statOrNull(iconDirCandidate) == null) {
        iconDir = path.resolve(packager.projectDir, iconDir)
      }
      else {
        iconDir = iconDirCandidate
      }
    }
    else if ((await packager.resourceList).includes("icons")) {
      iconDir = path.join(packager.info.buildResourcesDir, "icons")
    }

    let result: IconListResult
    if (iconDir == null) {
      const icnsPath = await this.getIcns()
      if (icnsPath == null) {
        result = await collectIcons(path.join(getTemplatePath("linux"), "electron-icons"))
      }
      else {
        result = JSON.parse(await exec(await getAppBuilderTool(), ["icns-to-png", "--input", icnsPath], execOptions))
      }
    }
    else {
      result = await collectIcons(iconDir)
    }

    this.maxIconPath = result.maxIconPath
    return result.icons
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