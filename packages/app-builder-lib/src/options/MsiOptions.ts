import { TargetSpecificOptions } from "../core"
import { CommonWindowsInstallerConfiguration } from "./CommonWindowsInstallerConfiguration"

export interface MsiOptions extends CommonWindowsInstallerConfiguration, TargetSpecificOptions {
  /**
   * One-click installation.
   * @default true
   */
  readonly oneClick?: boolean

  /**
   * The [upgrade code](https://msdn.microsoft.com/en-us/library/windows/desktop/aa372375(v=vs.85).aspx). Optional, by default generated using app id.
   */
  readonly upgradeCode?: string | null

  /**
   * If `warningsAsErrors` is `true` (default): treat warnings as errors. If `warningsAsErrors` is `false`: allow warnings.
   * @default true
   */
  readonly warningsAsErrors?: boolean

  /**
   * Any additional arguments to be passed to the WiX installer compiler, such as `["-ext", "WixUtilExtension"]`
   */
  readonly additionalWixArgs?: Array<string> | null

  /**
   * Any additional arguments to be passed to the light.ext, such as `["-cultures:ja-jp"]`
   */
  readonly additionalLightArgs?: Array<string> | null

  /**
   * The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants).
   * 
   * **Note: MSI installers only support RTF format.** The license file must be in RTF format for WiX to display it properly.
   * 
   * Multiple license files for different languages are supported — use lang postfix (e.g. `_de`, `_ru`). For example, create files `license_de.rtf` and `license_en.rtf` in the build resources.
   * If OS language is german, `license_de.rtf` will be displayed. See map of [language code to name](https://github.com/meikidd/iso-639-1/blob/master/src/data.js).
   * 
   * Appropriate license file will be selected by language id. English is the default language.
   * 
   * Note: This option is only applicable when `oneClick` is set to `false` (assisted installer). One-click installers do not show a license agreement page.
   */
  readonly license?: string | null
}
