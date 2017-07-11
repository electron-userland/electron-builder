import { NsisWebOptions } from "../options/winOptions"
import { computeDownloadUrl, getPublishConfigs, getPublishConfigsForUpdateInfo } from "../publish/PublishManager"
import { WinPackager } from "../winPackager"
import { AppPackageHelper, NsisTarget } from "./nsis"

/** @private */
export class WebInstallerTarget extends NsisTarget {
  constructor(packager: WinPackager, outDir: string, targetName: string, packageHelper: AppPackageHelper) {
    super(packager, outDir, targetName, packageHelper)
  }

  get isWebInstaller(): boolean {
    return true
  }

  protected async configureDefines(oneClick: boolean, defines: any) {
    //noinspection ES6MissingAwait
    await (NsisTarget.prototype as any).configureDefines.call(this, oneClick, defines)

    const packager = this.packager
    const options = this.options

    let appPackageUrl = (options as NsisWebOptions).appPackageUrl
    if (appPackageUrl == null) {
      const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, this.options, null), null)
      if (publishConfigs == null || publishConfigs.length === 0) {
        throw new Error("Cannot compute app package download URL")
      }

      appPackageUrl = computeDownloadUrl(publishConfigs[0], null, packager)
    }

    defines.APP_PACKAGE_URL_IS_INCOMLETE = null
    defines.APP_PACKAGE_URL = appPackageUrl
  }

  protected get installerFilenamePattern(): string {
    // tslint:disable:no-invalid-template-strings
    return "${productName} Web Setup ${version}.${ext}"
  }

  protected generateGitHubInstallerName(): string {
    const appInfo = this.packager.appInfo
    const classifier = appInfo.name.toLowerCase() === appInfo.name ? "web-setup" : "WebSetup"
    return `${appInfo.name}-${classifier}-${appInfo.version}.exe`
  }
}