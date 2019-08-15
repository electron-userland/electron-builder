import { asArray, isEmptyOrSpaces, log } from "builder-util"
import { outputFile } from "fs-extra"
import { Lazy } from "lazy-val"
import { LinuxTargetSpecificOptions } from ".."
import { LinuxPackager } from "../linuxPackager"
import { IconInfo } from "../platformPackager"

export const installPrefix = "/opt"

export class LinuxTargetHelper {
  private readonly iconPromise = new Lazy(() => this.computeDesktopIcons())

  private readonly mimeTypeFilesPromise = new Lazy(() => this.computeMimeTypeFiles())

  maxIconPath: string | null = null

  constructor(private packager: LinuxPackager) {
  }

  get icons(): Promise<Array<IconInfo>> {
    return this.iconPromise.value
  }

  get mimeTypeFiles(): Promise<string | null> {
    return this.mimeTypeFilesPromise.value
  }

  private async computeMimeTypeFiles(): Promise<string | null> {
    const items: Array<string> = []
    for (const fileAssociation of this.packager.fileAssociations) {
      if (!fileAssociation.mimeType) {
        continue
      }

      const data = `<mime-type type="${fileAssociation.mimeType}">
  <glob pattern="*.${fileAssociation.ext}"/>
    ${fileAssociation.description ? `<comment>${fileAssociation.description}</comment>` : ""}
  <icon name="x-office-document" />
</mime-type>`
      items.push(data)
    }

    if (items.length === 0) {
      return null
    }

    const file = await this.packager.getTempFile(".xml")
    await outputFile(file, '<?xml version="1.0" encoding="utf-8"?>\n<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n' + items.join("\n") + "\n</mime-info>")
    return file
  }

  // must be name without spaces and other special characters, but not product name used
  private async computeDesktopIcons(): Promise<Array<IconInfo>> {
    const packager = this.packager
    const iconDir = packager.platformSpecificBuildOptions.icon
    const sources = iconDir == null ? [] : [iconDir]

    const commonConfiguration = packager.config
    const icnsPath = (commonConfiguration.mac || {}).icon || commonConfiguration.icon
    if (icnsPath != null) {
      sources.push(icnsPath)
    }

    // need to put here and not as default because need to resolve image size
    const result = await packager.resolveIcon(sources, asArray(packager.getDefaultFrameworkIcon()), "set")
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
    // https://github.com/electron-userland/electron-builder/issues/3418
    if (targetSpecificOptions.desktop != null && targetSpecificOptions.desktop.Exec != null) {
      throw new Error("Please specify executable name as linux.executableName instead of linux.desktop.Exec")
    }

    const packager = this.packager
    const appInfo = packager.appInfo

    const productFilename = appInfo.productFilename

    if (exec == null) {
      exec = `${installPrefix}/${productFilename}/${packager.executableName}`
      if (!/^[/0-9A-Za-z._-]+$/.test(exec)) {
        exec = `"${exec}"`
      }
      exec += " %U"
    }

    const desktopMeta: any = {
      Name: appInfo.productName,
      Exec: exec,
      Terminal: "false",
      Type: "Application",
      Icon: packager.executableName,
      // https://askubuntu.com/questions/367396/what-represent-the-startupwmclass-field-of-a-desktop-file
      // must be set to package.json name (because it is Electron set WM_CLASS)
      // to get WM_CLASS of running window: xprop WM_CLASS
      // StartupWMClass doesn't work for unicode
      // https://github.com/electron/electron/blob/2-0-x/atom/browser/native_window_views.cc#L226
      StartupWMClass: appInfo.productName,
      ...extra,
      ...targetSpecificOptions.desktop,
    }

    const description = this.getDescription(targetSpecificOptions)
    if (!isEmptyOrSpaces(description)) {
      desktopMeta.Comment = description
    }

    const mimeTypes: Array<string> = asArray(targetSpecificOptions.mimeTypes)
    for (const fileAssociation of packager.fileAssociations) {
      if (fileAssociation.mimeType != null) {
        mimeTypes.push(fileAssociation.mimeType)
      }
    }

    for (const protocol of asArray(packager.config.protocols).concat(asArray(packager.platformSpecificBuildOptions.protocols))) {
      for (const scheme of asArray(protocol.schemes)) {
        mimeTypes.push(`x-scheme-handler/${scheme}`)
      }
    }

    if (mimeTypes.length !== 0) {
      desktopMeta.MimeType = mimeTypes.join(";") + ";"
    }

    let category = targetSpecificOptions.category
    if (isEmptyOrSpaces(category)) {
      const macCategory = (packager.config.mac || {}).category
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
          docs: "https://www.electron.build/configuration/linux",
        }, "application Linux category is set to default \"Utility\"")
        category = "Utility"
      }
    }
    desktopMeta.Categories = `${category}${category.endsWith(";") ? "" : ";"}`

    let data = `[Desktop Entry]`
    for (const name of Object.keys(desktopMeta)) {
      data += `\n${name}=${desktopMeta[name]}`
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
  "public.app-category.social-networking": "Network;Chat",
  "public.app-category.finance": "Office;Finance",
}
