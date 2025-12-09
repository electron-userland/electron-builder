import { Arch, log } from "builder-util"
<<<<<<< HEAD
<<<<<<< HEAD
import { computeDownloadUrl, getPublishConfigs, getPublishConfigsForUpdateInfo } from "../../publish/PublishManager.js"
import { WinPackager } from "../../winPackager.js"
import { NsisWebOptions } from "./nsisOptions.js"
import { NsisTarget } from "./NsisTarget.js"
import { AppPackageHelper } from "./nsisUtil.js"
=======
import { computeDownloadUrl, getPublishConfigs, getPublishConfigsForUpdateInfo } from "../../publish/PublishManager"
import { WinPackager } from "../../winPackager"
=======
import { computeDownloadUrl, getPublishConfigs, getPublishConfigsForUpdateInfo } from "../../publish/PublishManager.js"
import { WinPackager } from "../../winPackager.js"
>>>>>>> d26567f58 (tmp save)
import { NsisWebOptions } from "./nsisOptions.js.js"
import { NsisTarget } from "./NsisTarget.js.js"
import { AppPackageHelper } from "./nsisUtil.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)

/** @private */
export class WebInstallerTarget extends NsisTarget {
  constructor(packager: WinPackager, outDir: string, targetName: string, packageHelper: AppPackageHelper) {
    super(packager, outDir, targetName, packageHelper)
  }

  get isWebInstaller(): boolean {
    return true
  }

  protected async configureDefines(oneClick: boolean, defines: any): Promise<any> {
    //noinspection ES6MissingAwait
    await (NsisTarget.prototype as WebInstallerTarget).configureDefines.call(this, oneClick, defines)

    const packager = this.packager
    const options = this.options as NsisWebOptions

    let appPackageUrl = options.appPackageUrl
    if (appPackageUrl == null) {
      const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, this.options, null, false), null)
      if (publishConfigs == null || publishConfigs.length === 0) {
        throw new Error("Cannot compute app package download URL")
      }

      appPackageUrl = computeDownloadUrl(publishConfigs[0], null, packager)
      defines.APP_PACKAGE_URL_IS_INCOMPLETE = null
    }

    defines.APP_PACKAGE_URL = appPackageUrl
  }

  get shouldBuildUniversalInstaller() {
    if (this.options.buildUniversalInstaller === false) {
      log.warn({ buildUniversalInstaller: true }, "only universal builds are supported for nsis-web installers, overriding setting")
    }
    return true
  }

  protected installerFilenamePattern(_primaryArch?: Arch | null, _defaultArch?: string): string {
    return "${productName} Web Setup ${version}.${ext}"
  }

  protected generateGitHubInstallerName(): string {
    const appInfo = this.packager.appInfo
    const classifier = appInfo.name.toLowerCase() === appInfo.name ? "web-setup" : "WebSetup"
    return `${appInfo.name}-${classifier}-${appInfo.version}.exe`
  }
}
