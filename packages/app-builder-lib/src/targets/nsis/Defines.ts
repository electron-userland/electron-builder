import { PortableOptions } from "./nsisOptions"
import { PathLike } from "fs"
/**
 * Parameters declared as environment variables in NSIS scripts.
 * The documentation vaguely explains "All other electron-builder specific flags (e.g. ONE_CLICK) are still defined."
 * Parameters with null values in TypeScript can be treated as Boolean values using "!Ifdef" in NSIS Script.
 */
export type Defines = {
  APP_ID: string
  APP_GUID: unknown
  UNINSTALL_APP_KEY: unknown
  PRODUCT_NAME: string
  PRODUCT_FILENAME: string
  APP_FILENAME: string
  APP_DESCRIPTION: string
  VERSION: string

  PROJECT_DIR: string
  BUILD_RESOURCES_DIR: string

  APP_PACKAGE_NAME: string

  ENABLE_LOGGING_ELECTRON_BUILDER?: null
  UNINSTALL_REGISTRY_KEY_2?: string

  MUI_ICON?: unknown
  MUI_UNICON?: unknown

  APP_DIR_64?: string
  APP_DIR_ARM64?: string
  APP_DIR_32?: string

  APP_BUILD_DIR?: string

  APP_64?: string
  APP_ARM64?: string
  APP_32?: string

  APP_64_NAME?: string
  APP_ARM64_NAME?: string
  APP_32_NAME?: string

  APP_64_HASH?: string
  APP_ARM64_HASH?: string
  APP_32_HASH?: string

  APP_64_UNPACKED_SIZE?: string
  APP_ARM64_UNPACKED_SIZE?: string
  APP_32_UNPACKED_SIZE?: string

  REQUEST_EXECUTION_LEVEL?: PortableOptions["requestExecutionLevel"]

  UNPACK_DIR_NAME?: string | false

  SPLASH_IMAGE?: unknown

  ESTIMATED_SIZE?: number

  COMPRESS?: "auto"

  BUILD_UNINSTALLER?: null
  UNINSTALLER_OUT_FILE?: PathLike

  ONE_CLICK?: null
  RUN_AFTER_FINISH?: null
  HEADER_ICO?: string
  HIDE_RUN_AFTER_FINISH?: null

  MUI_HEADERIMAGE?: null
  MUI_HEADERIMAGE_RIGHT?: null
  MUI_HEADERIMAGE_BITMAP?: string

  MUI_WELCOMEFINISHPAGE_BITMAP?: string
  MUI_UNWELCOMEFINISHPAGE_BITMAP?: string

  MULTIUSER_INSTALLMODE_ALLOW_ELEVATION?: null

  INSTALL_MODE_PER_ALL_USERS?: null
  INSTALL_MODE_PER_ALL_USERS_REQUIRED?: null

  allowToChangeInstallationDirectory?: null

  removeDefaultUninstallWelcomePage?: null

  MENU_FILENAME?: string

  SHORTCUT_NAME?: string

  DELETE_APP_DATA_ON_UNINSTALL?: null

  UNINSTALLER_ICON?: string
  UNINSTALL_DISPLAY_NAME?: string

  RECREATE_DESKTOP_SHORTCUT?: null

  DO_NOT_CREATE_DESKTOP_SHORTCUT?: null

  DO_NOT_CREATE_START_MENU_SHORTCUT?: null

  DISPLAY_LANG_SELECTOR?: null

  COMPANY_NAME?: string

  APP_PRODUCT_FILENAME?: string

  APP_PACKAGE_STORE_FILE?: string

  APP_INSTALLER_STORE_FILE?: string

  ZIP_COMPRESSION?: null

  COMPRESSION_METHOD?: "zip" | "7z"
}
