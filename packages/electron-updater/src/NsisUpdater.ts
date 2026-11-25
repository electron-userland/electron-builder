import { AllPublishOptions, newError, PackageFileInfo, CURRENT_APP_INSTALLER_FILE_NAME, CURRENT_APP_PACKAGE_FILE_NAME } from "builder-util-runtime"
import { urlWithoutQuery } from "builder-util-runtime/internal"
import * as path from "path"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions, UpdateInfoAndProvider } from "./AppUpdater.js"
import { BaseUpdater, InstallOptions, WEB_INSTALLER_DISABLED_HINT } from "./BaseUpdater.js"
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper.js"
import { DifferentialDownloaderOptions } from "./differentialDownloader/DifferentialDownloader.js"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js"
import { DOWNLOAD_PROGRESS, DownloadExecutorResult, verificationFailureMessage } from "./types.js"
import type { VerifyUpdateCodeSignature, VerifyUpdateFileAuthenticodeSignature, VerifyUpdateFileResult } from "./types.js"
import { findFile, Provider } from "./providers/Provider.js"
import fsExtra from "fs-extra"
import fs from "fs"
import { randomBytes } from "crypto"
import { throwIfCancelled } from "./util.js"
import {
  isUpdateCodeSignatureVerificationDisabled,
  missingPublisherNameMessage,
  publisherNameDnNote,
  readConfiguredPublisherNames,
  resolveCatalogSignatureOptions,
  verifySignature,
} from "./windowsExecutableCodeSignatureVerifier.js"
import { URL } from "url"
import { readExecutableProductVersions } from "./windowsExecutableVersion.js"

const INSTALLER_VERSION_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#nsis-update-installers-must-carry-the-updates-version"
const INSTALLER_START_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#nsis-update-installer-start-and-elevate-exe"

function installerVersionMismatch(reason: string, expected: string): Error {
  return newError(
    `The installer of version ${expected} is rejected: ${reason}. electron-updater installs an update whose manifest is not signed only when the ProductVersion of its installer is the update version. ` +
      `Publish the installer built for that version with its latest.yml, or sign update manifests (updateManifestPublicKey). ${INSTALLER_VERSION_DOCS}`,
    "ERR_UPDATER_INSTALLER_VERSION_MISMATCH"
  )
}

export class NsisUpdater extends BaseUpdater {
  /**
   * Specify custom install directory path
   *
   */
  installDirectory?: string

  /**
   * Whether the default verify function accepts an update whose signature Windows reports from a security catalog.
   *
   * `Get-AuthenticodeSignature` reports the signer of a Windows security catalog (a signed list of file hashes, as Windows uses for its
   * in-box programs and drivers) in preference to the signature embedded in the file, when a catalog installed on the machine lists the
   * file's hash. An update installer built by electron-builder carries an embedded signature and is in no catalog, so a catalog
   * signature means that the downloaded file is another, catalogued file: it is rejected by default (`ERR_UPDATER_INVALID_SIGNATURE`).
   *
   * Set it to `true` only if your update installers are catalog-signed on purpose (for example, an enterprise deployment that adds their
   * hashes to a catalog). A catalog signature is then accepted only when it is valid, the catalog signer matches `publisherName` and the
   * verified file is the update file, like an embedded signature, and a warning is logged.
   *
   * An update can also allow it itself: a catalog signature is accepted the same way for an update whose `latest.yml` sets
   * `allowCatalogSignature: true` (written by electron-builder for `win.allowCatalogSignature`), but only when that manifest's signature was
   * verified against a trusted key (`updateManifestPublicKey`). In a manifest that was not verified, the setting is ignored with a warning.
   *
   * It applies to the default verify function only: a custom `verifyUpdateFileAuthenticodeSignature` decides for itself.
   * @default false
   */
  allowCatalogSignature = false

  /**
   * The subject(s) of the certificate that signs your updates, in distinguished name (DN) format (e.g. `"CN=My Company, O=My Company, C=US"`),
   * to verify the Authenticode signature of an update against when the update config has no `publisherName`: an `app-update.yml` without
   * one, or a packaged app whose update config file (`app-update.yml` or the `updateConfigPath` file) is missing when the update is
   * verified. The `publisherName` that electron-builder writes to `app-update.yml` wins over it, and it wins over
   * `verifyUpdateCodeSignature: false` in `app-update.yml` (the update is then verified).
   *
   * Without it, a packaged app whose update config file is missing when the update is verified rejects the update
   * (`ERR_UPDATER_NO_PUBLISHER_NAME`). A download reads that file first, so this happens only when the file goes missing after it was read,
   * for example when `updateConfigPath` is set to a file that does not exist after an earlier download; a packaged app without the file
   * fails the download itself, reading it (`ENOENT`).
   * @default null
   */
  publisherName: string | Array<string> | null = null

  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
    this.seedWebInstallerDefaultFromPackageType()
    void this.app.whenReady().then(() => this.removeInstalledWebPackage())
  }

  // The web installer installs its own copy of the package electron-updater passes with --package-file, so the package in the pending
  // directory is removed once the app runs the version of that update (after it was installed, never before or during the install).
  private async removeInstalledWebPackage(): Promise<void> {
    // like isUpdaterActive, without its log line: nothing is cached for an unpackaged app
    if (!this.app.isPackaged && !this.forceDevUpdateConfig) {
      return
    }
    try {
      // not getOrCreateDownloadHelper: that would fix the cache directory before the app had a chance to set updateConfigPath
      let downloadedUpdateHelper = this.downloadedUpdateHelper
      if (downloadedUpdateHelper == null) {
        const dirName = (await this.configOnDisk.value).updaterCacheDirName
        if (dirName == null) {
          return
        }
        downloadedUpdateHelper = new DownloadedUpdateHelper(path.join(this.app.baseCachePath, dirName), this.log)
      }
      await downloadedUpdateHelper.removeInstalledWebPackage(this.currentVersion.version)
    } catch (e: unknown) {
      // best effort: no readable app-update.yml (e.g. forceDevUpdateConfig without dev-app-update.yml) means no cache to clean, and an
      // unusable config is reported by the update check itself
      this.log.debug(`Cannot look for the web installer package of an installed update: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // nsis-web installs self-identify via a `resources/package-type` marker written by the installer.
  // When present, disableWebInstaller defaults to false so web-installer updates work without the app
  // wiring the flag by hand. This is a default only: a value the app sets (`autoUpdater.disableWebInstaller = …`)
  // wins. A plain `nsis` marker, or no marker, leaves the default (`true`), so web-installer updates are rejected
  // with ERR_UPDATER_WEB_INSTALLER_DISABLED.
  private seedWebInstallerDefaultFromPackageType(): void {
    try {
      const resourcesPath = process.resourcesPath
      if (!resourcesPath) {
        return
      }
      const packageTypePath = path.join(resourcesPath, "package-type")
      if (fsExtra.existsSync(packageTypePath) && fsExtra.readFileSync(packageTypePath, "utf-8").trim() === "nsis-web") {
        this.disableWebInstallerDefault = false
      }
    } catch (_ignored) {
      // best-effort: a missing/unreadable marker leaves the default (`true`) in place
    }
  }

  // called without an update: only NsisUpdater.allowCatalogSignature can allow a catalog signature (the update being installed is passed by
  // verifySignature below, which calls defaultVerifyAuthenticodeSignature directly while this default is in place)
  private readonly _defaultVerifyUpdateFileAuthenticodeSignature: VerifyUpdateFileAuthenticodeSignature = (publisherNames: Array<string>, unescapedTempUpdateFile: string) =>
    this.defaultVerifyAuthenticodeSignature(publisherNames, unescapedTempUpdateFile, null)

  private defaultVerifyAuthenticodeSignature(
    publisherNames: Array<string>,
    unescapedTempUpdateFile: string,
    update: UpdateInfoAndProvider | null
  ): Promise<VerifyUpdateFileResult> {
    // a v27 behaviour change an app built with an older electron-builder (or configured at runtime) would otherwise only
    // notice as rejected updates: announced once per updater, and repeated in the failure message
    const note = publisherNameDnNote(publisherNames)
    if (note != null) {
      this.limitedLogger("publisher-name-not-dn").warn(note)
    }
    // read when the verification runs, for this update only
    const options = resolveCatalogSignatureOptions(this.allowCatalogSignature, update, this.log)
    return verifySignature(publisherNames, unescapedTempUpdateFile, this.log, options)
  }

  protected _verifyUpdateFileAuthenticodeSignature: VerifyUpdateFileAuthenticodeSignature = this._defaultVerifyUpdateFileAuthenticodeSignature

  // built lazily and cached so that repeated reads of the deprecated accessor return the same function object, the way
  // reading the plain field used to; invalidated whenever the underlying implementation changes
  private _legacyVerifyUpdateCodeSignature: { implementation: VerifyUpdateFileAuthenticodeSignature; shim: VerifyUpdateCodeSignature } | null = null

  /**
   * @deprecated Use `verifyUpdateFileAuthenticodeSignature` instead, which differs in return type.
   * Shall be deleted in electron-builder v28.
   */
  protected get _verifyUpdateCodeSignature(): VerifyUpdateFileAuthenticodeSignature {
    return this._verifyUpdateFileAuthenticodeSignature
  }

  protected set _verifyUpdateCodeSignature(value: VerifyUpdateFileAuthenticodeSignature) {
    this._verifyUpdateFileAuthenticodeSignature = value
  }

  /**
   * The verifyUpdateFileAuthenticodeSignature. You can pass [win-verify-signature](https://github.com/beyondkmp/win-verify-trust) or another custom verify function: ` (publisherName: string[], path: string) => Promise<{ response: "success" } | { response: "failure", message: string }>`
   * The default verify function uses [windowsExecutableCodeSignatureVerifier](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts),
   * which rejects an update it cannot verify, e.g. when Windows PowerShell cannot be started or does not finish in time.
   *
   * Assigning `null` restores the default verify function.
   *
   * It is called only with a `publisherName`: the one of `app-update.yml` (or the `dev-app-update.yml` / `updateConfigPath` file), else
   * {@link publisherName}. Without either, no verify function runs and the update is rejected:
   * - when the update config file has no `publisherName`, the verification fails (`ERR_UPDATER_INVALID_SIGNATURE`), unless the file opts out
   *   with `verifyUpdateCodeSignature: false` (written by electron-builder for `win.verifyUpdateCodeSignature: false`);
   * - when the update config file of a packaged app is missing at the time the update is verified, `ERR_UPDATER_NO_PUBLISHER_NAME` is thrown
   *   (only after the file was read for the download: without it, the download fails first, reading it).
   */
  get verifyUpdateFileAuthenticodeSignature(): VerifyUpdateFileAuthenticodeSignature {
    return this._verifyUpdateFileAuthenticodeSignature
  }

  set verifyUpdateFileAuthenticodeSignature(value: VerifyUpdateFileAuthenticodeSignature | null | undefined) {
    this._verifyUpdateFileAuthenticodeSignature = value ?? this._defaultVerifyUpdateFileAuthenticodeSignature
  }

  /**
   * @deprecated Use verifyUpdateFileAuthenticodeSignature instead, which differs in return type.
   * This is a compatibility shim that keeps the old return type: returns null if verify signature succeeds or returns error message if it failed.
   * Shall be deleted in electron-builder v28.
   */
  get verifyUpdateCodeSignature(): VerifyUpdateCodeSignature {
    const implementation = this._verifyUpdateFileAuthenticodeSignature
    if (this._legacyVerifyUpdateCodeSignature?.implementation !== implementation) {
      this._legacyVerifyUpdateCodeSignature = {
        implementation,
        shim: async (publisherNames: Array<string>, unescapedTempUpdateFile: string) =>
          verificationFailureMessage(await implementation.call(this, publisherNames, unescapedTempUpdateFile)),
      }
    }
    return this._legacyVerifyUpdateCodeSignature.shim
  }

  set verifyUpdateCodeSignature(value: VerifyUpdateCodeSignature | null | undefined) {
    if (value == null) {
      this._verifyUpdateFileAuthenticodeSignature = this._defaultVerifyUpdateFileAuthenticodeSignature
      return
    }
    this._verifyUpdateFileAuthenticodeSignature = async (publisherNames: string[], unescapedTempUpdateFile: string) => {
      const message = await value.call(this, publisherNames, unescapedTempUpdateFile)
      // the legacy contract is "falsy means verified", so an empty message has to stay a success rather than become a
      // failure with no reason
      return message ? { response: "failure", message } : { response: "success" }
    }
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<DownloadExecutorResult> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "exe")!
    const webInstallerDisabled = downloadUpdateOptions.disableWebInstaller ?? true
    // the app set disableWebInstaller to false (read with the options above), not the default of an install made by an nsis-web installer
    const webInstallerEnabledByApp = this.isWebInstallerEnabledByApp
    // checked before executeDownload, so that it also applies to an update cached by a previous launch
    const info = downloadUpdateOptions.updateInfoAndProvider.info
    const packages = "packages" in info ? info.packages : null
    // a web installer started as an update without --package-file aborts (installer.nsh), so an update without a package for this arch
    // (the resolved one is of process.arch, else ia32) is rejected before it is downloaded
    if (packages != null && typeof packages === "object" && fileInfo.packageInfo == null) {
      return Promise.reject(
        newError(
          `Unable to download new version ${info.version}: its web installer has no app package for the arch ${process.arch} (packages: ${Object.keys(packages).join(", ") || "none"}). ` +
            `Build the nsis-web target for ${process.arch} (or ia32) and publish its package with latest.yml. ` +
            "https://www.electron.build/docs/migration/v27-runtime-changes#an-nsis-web-installer-started-as-an-update-needs-a-package-file",
          "ERR_UPDATER_NO_WEB_PACKAGE_FOR_ARCH"
        )
      )
    }
    if (fileInfo.packageInfo != null) {
      if (webInstallerDisabled) {
        return Promise.reject(
          newError(
            `Unable to download new version ${downloadUpdateOptions.updateInfoAndProvider.info.version}. Web Installers are disabled. ${WEB_INSTALLER_DISABLED_HINT}`,
            "ERR_UPDATER_WEB_INSTALLER_DISABLED"
          )
        )
      }
      if (fileInfo.packageInfo.sha512 == null) {
        return Promise.reject(
          newError(`Update info doesn't contain sha512 checksum for the web installer package: ${urlWithoutQuery(fileInfo.packageInfo.path)}`, "ERR_UPDATER_NO_CHECKSUM")
        )
      }
    }
    const signatureError = (failure: string) =>
      newError(`New version ${downloadUpdateOptions.updateInfoAndProvider.info.version} is not signed by the application owner: ${failure}`, "ERR_UPDATER_INVALID_SIGNATURE")
    return this.executeDownload({
      fileExtension: "exe",
      downloadUpdateOptions,
      fileInfo,
      // a cached installer is verified as a downloaded one is (see task): its signature, then its ProductVersion. Its signature, because it
      // sat in the pending directory since an earlier launch, and the checksum check right before the install (see startInstaller) pins the
      // installer to a file verified in this session. Its ProductVersion, because the cache is matched by sha512 only, and an installer
      // cached for another version (e.g. an older release, kept after it was installed) must not be reused for this one
      verifyCachedFile: async cachedFile => {
        const signatureFailure = verificationFailureMessage(await this.verifySignature(cachedFile, downloadUpdateOptions.updateInfoAndProvider))
        if (signatureFailure != null) {
          throw signatureError(signatureFailure)
        }
        await this.verifyInstallerVersion(cachedFile, downloadUpdateOptions.updateInfoAndProvider)
      },
      task: async (destinationFile, downloadOptions, packageFile, removeTempDirIfAny) => {
        const packageInfo = fileInfo.packageInfo
        const isWebInstaller = packageInfo != null && packageFile != null
        if (!isWebInstaller && !webInstallerDisabled) {
          if (webInstallerEnabledByApp) {
            this.log.warn(
              "disableWebInstaller is explicitly set to false, but a full installer (not a web installer) was downloaded. As of v27 web installers are opt-in (disabled by default); remove the override unless you intentionally publish NSIS web-installer packages."
            )
          } else {
            // the nsis-web default (package-type marker) needs no change by the app, but the full installer writes the `nsis` marker
            this.log.info(
              "A full installer (not a web installer) was downloaded for an install made by an nsis-web installer. After it is installed, web-installer updates need disableWebInstaller = false."
            )
          }
        }
        if (
          isWebInstaller ||
          downloadUpdateOptions.disableDifferentialDownload ||
          (await this.differentialDownloadInstaller(fileInfo, downloadUpdateOptions, destinationFile, provider, CURRENT_APP_INSTALLER_FILE_NAME))
        ) {
          await this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions)
        }

        const signatureFailure = verificationFailureMessage(await this.verifySignature(destinationFile, downloadUpdateOptions.updateInfoAndProvider))
        if (signatureFailure != null) {
          await removeTempDirIfAny()
          // noinspection ThrowInsideFinallyBlockJS
          throw signatureError(signatureFailure)
        }
        await this.verifyInstallerVersion(destinationFile, downloadUpdateOptions.updateInfoAndProvider)

        if (isWebInstaller) {
          if (await this.differentialDownloadWebPackage(downloadUpdateOptions, packageInfo, packageFile, provider)) {
            try {
              const packageUrl = new URL(packageInfo.path)
              await this.httpExecutor.download(packageUrl, packageFile, {
                headers: this.downloadRequestHeaders(packageUrl, downloadUpdateOptions),
                ownHeaders: this.downloadOwnHeaders(downloadUpdateOptions),
                cancellationToken: downloadUpdateOptions.cancellationToken,
                sha512: packageInfo.sha512,
                maxSize: packageInfo.size,
              })
            } catch (e: any) {
              try {
                await fsExtra.unlink(packageFile)
              } catch (_ignored) {
                // ignore
              }

              throw e
            }
          }
        }
      },
    })
  }

  // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
  // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
  // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
  //
  // Fails closed. The update is verified against the publisherName of the update config, else the app's own `publisherName` property.
  // A custom verifier is never called without a publisherName: it would get no names to match, and one checking them with e.g. `every`
  // would accept any signer. Without a publisherName the update is rejected:
  // - update config file without publisherName: a failure result (ERR_UPDATER_INVALID_SIGNATURE at the caller), unless the config opts
  //   out explicitly (`verifyUpdateCodeSignature: false`, written by electron-builder for `win.verifyUpdateCodeSignature: false`). The
  //   opt-out applies only without a publisherName: the app's `publisherName` property wins over it, like one in the config;
  // - packaged app without an update config file: ERR_UPDATER_NO_PUBLISHER_NAME is thrown. A download reads the config before it starts,
  //   so this is reached when updateConfigPath names a missing file after an earlier download of this updater.
  // An unpackaged app (dev mode) without an update config file is not verified.
  //
  // `update` is the update the file belongs to: the default verify function accepts a catalog signature for it when its verified manifest
  // allows one (see allowCatalogSignature). Without it, only NsisUpdater.allowCatalogSignature does.
  private async verifySignature(tempUpdateFile: string, update: UpdateInfoAndProvider | null = null): Promise<VerifyUpdateFileResult> {
    const resolved = await this.resolveUpdatePublisherNames()
    if (resolved == null) {
      // no dev-app-update.yml in dev mode: nothing to verify against, stay silent
      return { response: "success" }
    }
    const { publisherNames, config, hasConfigFile } = resolved
    if (publisherNames != null) {
      const implementation = this._verifyUpdateFileAuthenticodeSignature
      if (implementation === this._defaultVerifyUpdateFileAuthenticodeSignature) {
        return await this.defaultVerifyAuthenticodeSignature(publisherNames, tempUpdateFile, update)
      }
      return await implementation.call(this, publisherNames, tempUpdateFile)
    }
    if (!hasConfigFile) {
      // a custom verifier is not called either: it would get no names to match
      throw newError(
        "The update is rejected: the update config file of the packaged app (app-update.yml or the updateConfigPath file) is missing, " +
          "so there is no publisherName to verify its Authenticode signature against (a custom verifyUpdateFileAuthenticodeSignature is called only with a publisherName). " +
          "Make sure the file exists (build the app with a publish configuration so that electron-builder writes app-update.yml with the publisherName), " +
          "or set autoUpdater.publisherName to the subject of the certificate that signs your updates. " +
          "https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification",
        "ERR_UPDATER_NO_PUBLISHER_NAME"
      )
    }
    if (isUpdateCodeSignatureVerificationDisabled(config)) {
      this.limitedLogger("update-signature-verification-disabled").warn(
        "Signature verification of downloaded updates is disabled by configuration (verifyUpdateCodeSignature: false in app-update.yml, written for win.verifyUpdateCodeSignature: false)."
      )
      return { response: "success" }
    }
    return { response: "failure", message: missingPublisherNameMessage() }
  }

  // The publisherName an update is verified against (see verifySignature): the one of the update config, else the app's `publisherName`
  // property. `null` for an unpackaged app (dev mode) without an update config file, which is not verified. `config` is null when a
  // packaged app has no update config file.
  private async resolveUpdatePublisherNames(): Promise<{ publisherNames: Array<string> | null; config: unknown; hasConfigFile: boolean } | null> {
    let config: unknown = null
    let hasConfigFile = true
    try {
      config = await this.configOnDisk.value
    } catch (e: unknown) {
      if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) {
        throw e
      }
      if (!this.app.isPackaged) {
        return null
      }
      hasConfigFile = false
    }
    // the runtime value goes through the same normalizer as the config's: a string, or the string entries of an array, else null
    const publisherNames = readConfiguredPublisherNames(config) ?? readConfiguredPublisherNames({ publisherName: this.publisherName })
    return { publisherNames, config, hasConfigFile }
  }

  // A signature proves that the installer is a release of the app, not which one: an update manifest that is not signed could announce a
  // newer version and serve the signed installer of an older release, or a web installer built for another version. The ProductVersion
  // that electron-builder writes into the installer (the app version, also the version of latest.yml) must therefore be the version of the
  // update. Checked whenever verifySignature verifies the signature against a publisherName (of the update config, or the app's
  // `publisherName` property). Not checked when the manifest signature was verified (it binds the installer by its sha512), and not
  // without a publisherName: the signature is then not verified (dev mode, `verifyUpdateCodeSignature: false`) or the update is rejected.
  private async verifyInstallerVersion(installerPath: string, update: UpdateInfoAndProvider): Promise<void> {
    if (update.manifestSignatureVerified === true) {
      return
    }
    const resolved = await this.resolveUpdatePublisherNames()
    if (resolved?.publisherNames == null) {
      return
    }
    const expected = update.info.version
    let versions: Array<string>
    try {
      versions = await readExecutableProductVersions(installerPath)
    } catch (e: unknown) {
      // a file system error (e.g. EBUSY or EACCES while an antivirus scans the installer) is no verdict on the installer
      if (e instanceof Error && "syscall" in e) {
        throw e
      }
      throw installerVersionMismatch(`its ProductVersion cannot be read (${e instanceof Error ? e.message : String(e)})`, expected)
    }
    if (versions.length === 0) {
      throw installerVersionMismatch("it has no ProductVersion", expected)
    }
    const other = versions.find(it => it !== expected)
    if (other != null) {
      throw installerVersionMismatch(`its ProductVersion is ${JSON.stringify(other)}`, expected)
    }
  }

  // the cached installer sat on disk since a previous launch, so its Authenticode signature and its ProductVersion are re-verified before
  // an install-on-next-launch is executed (same checks as at download time). The pending installer is matched to the latest update info
  // by sha512 only, so a manifest announcing another version for it is rejected here (ERR_UPDATER_INSTALLER_VERSION_MISMATCH is thrown,
  // and the caller clears the pending update, so it is not retried on every launch).
  protected async verifyInstallerSignatureOnLaunch(installerPath: string, updateInfoAndProvider: UpdateInfoAndProvider): Promise<VerifyUpdateFileResult> {
    const signature = await this.verifySignature(installerPath, updateInfoAndProvider)
    if (signature.response === "success") {
      await this.verifyInstallerVersion(installerPath, updateInfoAndProvider)
    }
    return signature
  }

  // per-user NSIS installs run without an elevation prompt (per-machine installs are filtered separately via
  // isAdminRightsRequired), so the automatic install at startup is allowed
  protected get isAutoInstallOnNextLaunchSupported(): boolean {
    return true
  }

  // the install on quit cannot wait for the installer to start: a start that is refused or fails emits "error" after this returned true
  protected doInstall(options: InstallOptions): boolean {
    return this.startInstaller(options) !== false
  }

  // quitAndInstall and the install on launch verify the installer's signature again right before startInstaller starts it, as when it was
  // downloaded, and wait for the installer to start, so that a start that is refused or fails returns false and the app does not quit.
  // The install on quit cannot wait for either, and relies on the checksum check in startInstaller: it pins the installer to the file
  // whose signature was verified in this session, when it was downloaded or reused from the cache.
  protected async doInstallAsync(options: InstallOptions): Promise<boolean> {
    const installerPath = this.installerPath
    if (installerPath != null) {
      const signatureFailure = verificationFailureMessage(await this.verifySignature(installerPath, this.updateInfoAndProvider))
      if (signatureFailure != null) {
        this.rejectDownloadedUpdate(newError(`The downloaded update is not signed by the application owner: ${signatureFailure}`, "ERR_UPDATER_INVALID_SIGNATURE"))
        return false
      }
    }
    return await this.startInstaller(options)
  }

  // Returns false when a check before the start refuses the install (an "error" event was emitted). Otherwise starts the installer and
  // returns the start: it resolves true once an installer process started, and false once its start was refused or failed (an "error"
  // event was emitted). It never rejects.
  private startInstaller(options: InstallOptions): false | Promise<boolean> {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }

    const args = ["--updated"]
    if (options.isSilent) {
      args.push("/S")
    }

    if (options.isForceRunAfter) {
      args.push("--force-run")
    }

    const packagePath = this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.packageFile
    if (packagePath != null) {
      // the policy may have changed since the download; never run the web installer when web installers are disabled
      if (this.disableWebInstaller) {
        this.dispatchError(newError(`Unable to install the downloaded update. Web Installers are disabled. ${WEB_INSTALLER_DISABLED_HINT}`, "ERR_UPDATER_WEB_INSTALLER_DISABLED"))
        return false
      }
      // only = form is supported
      args.push(`--package-file=${packagePath}`)
    }

    // must be the last argument: NSIS takes the rest of the command line after /D= as the directory (see GetDParameter in multiUser.nsh)
    if (this.installDirectory) {
      // maybe check if folder exists
      args.push(`/D=${this.installDirectory}`)
    }

    // an "error" listener that throws must not reject the start, which doInstall does not wait for
    const fail = (error: unknown): false => {
      try {
        this.dispatchError(error instanceof Error ? error : new Error(String(error)))
      } catch (nestedError: unknown) {
        this.log.warn(`Cannot dispatch error event: ${nestedError instanceof Error ? (nestedError.stack ?? nestedError.message) : String(nestedError)}`)
      }
      return false
    }
    const startUsingElevation = (): Promise<boolean> => this.spawnLog(path.join(process.resourcesPath, "elevate.exe"), [installerPath].concat(args)).then(() => true, fail)

    if (!this.verifyDownloadedUpdateBeforeInstall()) {
      return false
    }

    // set when an update with isAdminRightsRequired found that elevate.exe may not run; an EACCES or UNKNOWN of the direct start below reuses it
    let adminRightsRefusal: string | null = null
    if (options.isAdminRightsRequired) {
      const refusal = this.elevationRefusal()
      if (refusal == null) {
        this.log.info("isAdminRightsRequired is set to true, run installer using elevate.exe")
        return startUsingElevation()
      }
      // An app that already runs elevated (UAC turned off, the built-in Administrator, Run as administrator) can modify the files elevationRefusal
      // writes to as well, and elevate.exe adds nothing for it: the installer is started directly and gets the rights of the app, never more.
      // Windows refuses, with EACCES, to start a per-machine installer (RequestExecutionLevel admin) from an app that does not run elevated, and
      // that is refused below: a folder any process of the user can modify (e.g. an app installed per user) still gets no elevated installer
      this.log.info(
        `isAdminRightsRequired is set to true, but elevate.exe is not used (${refusal}): the installer is started directly and gets the rights of the app, so it installs only if the app runs with administrator rights. See ${INSTALLER_START_DOCS}`
      )
      adminRightsRefusal = refusal
    }

    return (
      this.spawnLog(installerPath, args)
        .then(
          () => true,
          (e: unknown) => {
            const errorCode = e instanceof Error && "code" in e ? e.code : undefined
            const message = e instanceof Error ? e.message : String(e)
            // EACCES (ERROR_ELEVATION_REQUIRED: the installer asks for elevation, so the app does not run elevated) and UNKNOWN (Windows errors
            // libuv has no name for, e.g. ERROR_ACCESS_DISABLED_BY_POLICY: AppLocker or WDAC rules that let only administrators run files outside
            // Program Files and Windows) are retried through elevate.exe, under the same rule as isAdminRightsRequired (see elevationRefusal).
            // ENOENT (a missing installer) is neither elevated nor opened with the shell
            if (errorCode === "EACCES" || errorCode === "UNKNOWN") {
              const refusal = adminRightsRefusal ?? this.elevationRefusal()
              if (refusal != null) {
                return fail(
                  newError(
                    `Cannot start the update installer through elevate.exe: Windows refused to start the installer directly (${errorCode}: ${message}), which happens when it requires administrator rights or when a policy such as AppLocker or WDAC lets only administrators run it, but ${refusal}. The update installer is started through elevate.exe only when the current user cannot modify elevate.exe, its folder or the install folder of the app; an app that runs with administrator rights starts the installer directly. Install per-machine apps into a folder only administrators can write, e.g. build them with nsis.perMachine: true; an update cannot switch an app installed per user to a per-machine installation unless the app runs with administrator rights. See ${INSTALLER_START_DOCS}`,
                    "ERR_UPDATER_INSTALLER_ELEVATION_REFUSED"
                  )
                )
              }
              this.log.info(`Cannot run installer (${errorCode}: "${message}"), run installer using elevate.exe`)
              // the first start failed after the check above: the installer is checked again before it is started elevated
              if (!this.verifyDownloadedUpdateBeforeInstall()) {
                return false
              }
              return startUsingElevation()
            }
            if (errorCode === "ENOENT") {
              return fail(
                newError(
                  `Cannot start the update installer (${errorCode}: ${message}): the installer file or its folder is missing. A missing installer is neither started through elevate.exe nor opened with the shell. Check whether security software removed or quarantined the downloaded installer, or install the update manually. See ${INSTALLER_START_DOCS}`,
                  "ERR_UPDATER_INSTALLER_START_FAILED"
                )
              )
            }
            return fail(e)
          }
        )
        // the re-check before the elevated start emits "error" itself, and an "error" listener that throws must not reject the start either
        .catch(fail)
    )
  }

  // elevate.exe starts the update installer with administrator rights, so it is run only when the current user cannot modify it, the
  // folder that holds it or the install folder of the app (the folder of process.execPath): only then can nobody but an administrator
  // replace it. Returns why it may not run, or null when it may.
  //
  // Node's fs.access does not read Windows ACLs, so writing is attempted for real: elevate.exe is opened for writing (r+, which neither
  // truncates nor changes it) and a file with a unique name is created (wx) and removed in each folder. EACCES, EPERM and EROFS (a
  // read-only volume) mean the user cannot write there. ENOENT means the file or folder is missing; it counts as not modifiable because
  // the folder that would hold it is checked as well, and a missing elevate.exe then fails to start with the spawn error. Any other
  // error refuses elevate.exe: whether the user can modify it is unknown.
  private elevationRefusal(): string | null {
    const elevatePath = path.join(process.resourcesPath, "elevate.exe")
    const canWrite = (attempt: () => void): boolean => {
      try {
        attempt()
        return true
      } catch (e: unknown) {
        const code = e instanceof Error && "code" in e ? e.code : undefined
        if (code === "EACCES" || code === "EPERM" || code === "EROFS" || code === "ENOENT") {
          return false
        }
        throw e
      }
    }

    let target = elevatePath
    let reason: string | null = null
    try {
      if (canWrite(() => fs.closeSync(fs.openSync(elevatePath, "r+")))) {
        reason = `the current user can modify ${elevatePath}`
      } else {
        for (const dir of [path.dirname(elevatePath), path.dirname(process.execPath)]) {
          target = dir
          const probeFile = path.join(dir, `.elevate-check-${randomBytes(8).toString("hex")}.tmp`)
          if (canWrite(() => fs.closeSync(fs.openSync(probeFile, "wx")))) {
            try {
              fs.unlinkSync(probeFile)
            } catch (e: unknown) {
              this.log.warn(`Cannot remove ${probeFile}: ${e instanceof Error ? e.message : String(e)}`)
            }
            reason = `the current user can create files in ${dir}`
            break
          }
        }
      }
    } catch (e: unknown) {
      const code = e instanceof Error && "code" in e ? e.code : undefined
      reason = `cannot tell whether the current user can modify ${target} (${String(code)}: ${e instanceof Error ? e.message : String(e)})`
    }
    return reason
  }

  private async differentialDownloadWebPackage(
    downloadUpdateOptions: DownloadUpdateOptions,
    packageInfo: PackageFileInfo,
    packagePath: string,
    provider: Provider<any>
  ): Promise<boolean> {
    if (packageInfo.blockMapSize == null) {
      return true
    }

    try {
      const newUrl = new URL(packageInfo.path)
      const downloadOptions: DifferentialDownloaderOptions = {
        newUrl,
        oldFile: path.join(this.downloadedUpdateHelper!.cacheDir, CURRENT_APP_PACKAGE_FILE_NAME),
        logger: this.log,
        newFile: packagePath,
        requestHeaders: this.downloadRequestHeaders(newUrl, downloadUpdateOptions),
        isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
        cancellationToken: downloadUpdateOptions.cancellationToken,
      }

      if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
        downloadOptions.onProgress = it => this.emitDownloadProgress(it)
      }

      await new FileWithEmbeddedBlockMapDifferentialDownloader(packageInfo, this.httpExecutor, downloadOptions).download()
    } catch (e: any) {
      // a user cancellation is not a differential failure: no fallback to a full download
      throwIfCancelled(e, downloadUpdateOptions.cancellationToken)
      this.logDifferentialDownloadFallback(e)
      // during test (developer machine mac or linux) we must throw error
      return process.platform === "win32"
    }
    return false
  }
}
