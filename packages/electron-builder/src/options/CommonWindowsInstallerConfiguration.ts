import { WinPackager } from "../winPackager"
import { isEmptyOrSpaces } from "builder-util"
import sanitizeFileName from "sanitize-filename"

export interface CommonWindowsInstallerConfiguration {
  readonly oneClick?: boolean

  /**
   * Whether to install per all users (per-machine).
   * @default false
   */
  readonly perMachine?: boolean

  /**
   * *one-click installer only.*  Whether to run the installed application after finish.
   * @default true
   */
  readonly runAfterFinish?: boolean

  /**
   * Whether to create desktop shortcut.
   * @default true
   */
  readonly createDesktopShortcut?: boolean

  /**
   * Whether to create start menu shortcut.
   * @default true
   */
  readonly createStartMenuShortcut?: boolean

  /**
   * Whether to create submenu for start menu shortcut and program files directory. If `true`, company name will be used. Or string value.
   * @default false
   */
  readonly menuCategory?: boolean | string

  /**
   * The name that will be used for all shortcuts. Defaults to the application name.
   */
  readonly shortcutName?: string | null
}

export interface FinalCommonWindowsInstallerOptions {
  isAssisted: boolean
  isPerMachine: boolean

  shortcutName: string
  menuCategory: string | null

  isCreateDesktopShortcut: boolean
  isCreateStartMenuShortcut: boolean
}

export function getEffectiveOptions(options: CommonWindowsInstallerConfiguration, packager: WinPackager): FinalCommonWindowsInstallerOptions {
  const appInfo = packager.appInfo

  let menuCategory: string | null = null
  if (options.menuCategory != null && options.menuCategory !== false) {
    if (options.menuCategory === true) {
      const companyName = packager.appInfo.companyName
      if (companyName == null) {
        throw new Error(`Please specify "author" in the application package.json — it is required because "menuCategory" is set to true.`)
      }
      menuCategory = sanitizeFileName(companyName)
    }
    else {
      menuCategory = (options.menuCategory as string).split(/[\/\\]/).map(it => sanitizeFileName(it)).join("\\")
    }
  }

  return {
    isPerMachine: options.perMachine === true,
    isAssisted: options.oneClick === false,

    shortcutName: isEmptyOrSpaces(options.shortcutName) ? appInfo.productFilename : packager.expandMacro(options.shortcutName!!),
    isCreateDesktopShortcut: options.createDesktopShortcut !== false,
    isCreateStartMenuShortcut: options.createStartMenuShortcut !== false,
    menuCategory,
  }
}