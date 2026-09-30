import { createRequire } from "node:module"
import { AllPublishOptions, newError, PackageFileInfo, CURRENT_APP_INSTALLER_FILE_NAME, CURRENT_APP_PACKAGE_FILE_NAME } from "builder-util-runtime"
import { ChildProcess, spawn } from "child_process"
import * as path from "path"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { BaseUpdater, InstallOptions } from "./BaseUpdater.js"
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper.js"
import { DifferentialDownloaderOptions } from "./differentialDownloader/DifferentialDownloader.js"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js"
import { DOWNLOAD_PROGRESS, DownloadExecutorResult, verificationFailureMessage } from "./types.js"
import type { VerifyUpdateCodeSignature, VerifyUpdateFileAuthenticodeSignature, VerifyUpdateFileResult } from "./types.js"
import { findFile, Provider } from "./providers/Provider.js"
import fsExtra from "fs-extra"
import { verifySignature } from "./windowsExecutableCodeSignatureVerifier.js"
import { buildElevatedInstallerInvocation, UAC_CANCELLED_EXIT_CODE } from "./windowsElevation.js"
import { URL } from "url"

const require = createRequire(import.meta.url)

// see NsisUpdater.runElevationTrampoline
const ELEVATION_TIMEOUT_MS = 5 * 60 * 1000

type ElevationOutcome = "launched" | "cancelled" | "unavailable"

export class NsisUpdater extends BaseUpdater {
  /**
   * Specify custom install directory path
   *
   */
  installDirectory?: string

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
        downloadedUpdateHelper = new DownloadedUpdateHelper(path.join(this.app.baseCachePath, dirName))
      }
      await downloadedUpdateHelper.removeInstalledWebPackage(this.currentVersion.version, this._logger)
    } catch (e: any) {
      // best effort: no readable app-update.yml (e.g. forceDevUpdateConfig without dev-app-update.yml) means no cache to clean, and an
      // unusable config is reported by the update check itself
      this._logger.debug?.(`Cannot look for the web installer package of an installed update: ${e.message || e}`)
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

  private readonly _defaultVerifyUpdateFileAuthenticodeSignature: VerifyUpdateFileAuthenticodeSignature = (publisherNames: Array<string>, unescapedTempUpdateFile: string) =>
    verifySignature(publisherNames, unescapedTempUpdateFile, this._logger)

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
   * The default verify function uses [windowsExecutableCodeSignatureVerifier](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts)
   *
   * Assigning `null` restores the default verify function.
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
    if (fileInfo.packageInfo != null) {
      if (webInstallerDisabled) {
        return Promise.reject(
          newError(`Unable to download new version ${downloadUpdateOptions.updateInfoAndProvider.info.version}. Web Installers are disabled`, "ERR_UPDATER_WEB_INSTALLER_DISABLED")
        )
      }
      if (fileInfo.packageInfo.sha512 == null) {
        return Promise.reject(newError(`Update info doesn't contain sha512 checksum for the web installer package: ${fileInfo.packageInfo.path}`, "ERR_UPDATER_NO_CHECKSUM"))
      }
    }
    return this.executeDownload({
      fileExtension: "exe",
      downloadUpdateOptions,
      fileInfo,
      task: async (destinationFile, downloadOptions, packageFile, removeTempDirIfAny) => {
        const packageInfo = fileInfo.packageInfo
        const isWebInstaller = packageInfo != null && packageFile != null
        if (!isWebInstaller && !webInstallerDisabled) {
          if (webInstallerEnabledByApp) {
            this._logger.warn(
              "disableWebInstaller is explicitly set to false, but a full installer (not a web installer) was downloaded. As of v27 web installers are opt-in (disabled by default); remove the override unless you intentionally publish NSIS web-installer packages."
            )
          } else {
            // the nsis-web default (package-type marker) needs no change by the app, but the full installer writes the `nsis` marker
            this._logger.info(
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

        const signatureFailure = verificationFailureMessage(await this.verifySignature(destinationFile))
        if (signatureFailure != null) {
          await removeTempDirIfAny()
          // noinspection ThrowInsideFinallyBlockJS
          throw newError(
            `New version ${downloadUpdateOptions.updateInfoAndProvider.info.version} is not signed by the application owner: ${signatureFailure}`,
            "ERR_UPDATER_INVALID_SIGNATURE"
          )
        }

        if (isWebInstaller) {
          if (await this.differentialDownloadWebPackage(downloadUpdateOptions, packageInfo, packageFile, provider)) {
            try {
              await this.httpExecutor.download(new URL(packageInfo.path), packageFile, {
                headers: downloadUpdateOptions.requestHeaders,
                cancellationToken: downloadUpdateOptions.cancellationToken,
                sha512: packageInfo.sha512,
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
  private async verifySignature(tempUpdateFile: string): Promise<VerifyUpdateFileResult> {
    let publisherName: Array<string> | string | null
    try {
      publisherName = (await this.configOnDisk.value).publisherName
      if (publisherName == null) {
        this._logger.warn(
          "Signature verification of the downloaded update was skipped because no publisherName is present in app-update.yml. " +
            "Sign your build so electron-builder can derive publisherName from the code signing certificate automatically, or set win.sign.publisherName explicitly. " +
            "This fail-open behavior is deprecated: electron-builder v28 will treat a missing publisherName as a verification failure (fail-closed)."
        )
        return { response: "success" }
      }
    } catch (e: any) {
      if (e.code === "ENOENT") {
        // no app-update.yml at all (unpackaged/dev mode) — nothing to verify against, stay silent
        return { response: "success" }
      }
      throw e
    }
    return await this._verifyUpdateFileAuthenticodeSignature(Array.isArray(publisherName) ? publisherName : [publisherName], tempUpdateFile)
  }

  // the cached installer sat on disk since a previous launch, so its Authenticode signature is re-verified before an
  // install-on-next-launch is executed (same check as at download time)
  protected verifyInstallerSignatureOnLaunch(installerPath: string): Promise<VerifyUpdateFileResult> {
    return this.verifySignature(installerPath)
  }

  // per-user NSIS installs run without an elevation prompt (per-machine installs are filtered separately via
  // isAdminRightsRequired), so the automatic install at startup is allowed
  protected get isAutoInstallOnNextLaunchSupported(): boolean {
    return true
  }

  protected doInstall(options: InstallOptions): boolean | Promise<boolean> {
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
        this.dispatchError(newError("Unable to install the downloaded update. Web Installers are disabled", "ERR_UPDATER_WEB_INSTALLER_DISABLED"))
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

    if (options.isAdminRightsRequired) {
      this._logger.info("isAdminRightsRequired is set to true, run installer with UAC elevation (PowerShell Start-Process -Verb RunAs, elevate.exe as fallback)")
      if (options.isAppQuitting) {
        // the app quit handler cannot wait for the trampoline to report, so the launch is fire-and-forget here
        this.launchElevatedDetached(installerPath, args)
        return true
      }
      return this.launchElevated(installerPath, args)
    }

    this.spawnLog(installerPath, args).catch((e: Error) => {
      // https://github.com/electron-userland/electron-builder/issues/1129
      // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
      const errorCode = (e as NodeJS.ErrnoException).code
      this._logger.info(
        `Cannot run installer: error code: ${errorCode}, error message: "${e.message}", will be executed again using UAC elevation if EACCES, and will try to use electron.shell.openPath if ENOENT`
      )
      if (errorCode === "UNKNOWN" || errorCode === "EACCES") {
        // doInstall has already reported success and the app is quitting — nothing can wait for the trampoline any more
        this.launchElevatedDetached(installerPath, args)
      } else if (errorCode === "ENOENT") {
        require("electron")
          .shell.openPath(installerPath)
          .catch((err: Error) => this.dispatchError(err))
      } else {
        this.dispatchError(e)
      }
    })
    return true
  }

  /**
   * Launches the installer elevated and waits until the outcome is known:
   * - the PowerShell trampoline (`Start-Process -Verb RunAs`) reports that the installer is running → `true`;
   * - the user declined the UAC prompt → an `error` event (`ERR_UPDATER_ELEVATION_CANCELLED`) and `false`. There is
   *   deliberately no fallback here: `elevate.exe` would only show the same prompt a second time;
   * - PowerShell cannot be started, is blocked (e.g. AppLocker/WDAC/constrained language mode), exits with another error
   *   or does not report in time → falls back to the bundled `resources/elevate.exe`, exactly as before.
   */
  private async launchElevated(installerPath: string, args: Array<string>): Promise<boolean> {
    const outcome = await this.runElevationTrampoline(installerPath, args)
    switch (outcome) {
      case "launched":
        this._logger.info("Installer started with UAC elevation via PowerShell")
        return true
      case "cancelled":
        this.dispatchError(newError("Update installation was cancelled: the UAC elevation prompt was declined", "ERR_UPDATER_ELEVATION_CANCELLED"))
        return false
      default:
        this._logger.warn("UAC elevation via PowerShell is not available, falling back to elevate.exe")
        return this.launchWithElevateHelper(installerPath, args)
    }
  }

  /**
   * Fire-and-forget variant of {@link launchElevated} for the paths where the app is already quitting: the trampoline is
   * spawned detached like any other installer launch. Only a spawn failure (e.g. `ENOENT`) can be observed here, so a
   * PowerShell that starts but then fails (blocked, or UAC declined) is invisible, like it was with `elevate.exe`.
   */
  private launchElevatedDetached(installerPath: string, args: Array<string>): void {
    const invocation = buildElevatedInstallerInvocation(installerPath, args)
    this.spawnLog(invocation.file, invocation.args, invocation.env).catch((e: Error) => {
      this._logger.warn(`Cannot start PowerShell for UAC elevation (${(e as NodeJS.ErrnoException).code ?? e.message}), falling back to elevate.exe`)
      void this.launchWithElevateHelper(installerPath, args)
    })
  }

  // legacy elevation through the bundled third-party helper (win.packElevateHelper)
  private launchWithElevateHelper(installerPath: string, args: Array<string>): Promise<boolean> {
    return this.spawnLog(path.join(process.resourcesPath, "elevate.exe"), [installerPath, ...args]).catch((e: Error) => {
      this.dispatchError(e)
      return false
    })
  }

  /**
   * Runs the PowerShell elevation trampoline (see `windowsElevation.ts`) and maps its result. The child is not detached:
   * its exit code is the only channel through which the UAC outcome is reported. `Start-Process -Verb RunAs` blocks while
   * the UAC consent dialog is open, so the timeout is generous — it only guards against a hung PowerShell host, never
   * against a user who is still deciding (Windows itself dismisses an unanswered prompt after about two minutes).
   */
  private runElevationTrampoline(installerPath: string, args: Array<string>): Promise<ElevationOutcome> {
    const invocation = buildElevatedInstallerInvocation(installerPath, args)
    this._logger.info(`Executing: ${invocation.file} with args: ${invocation.args}`)
    return new Promise<ElevationOutcome>(resolve => {
      let isSettled = false
      let timer: NodeJS.Timeout | null = null
      const settle = (outcome: ElevationOutcome, message: string) => {
        if (isSettled) {
          return
        }
        isSettled = true
        if (timer != null) {
          clearTimeout(timer)
        }
        this._logger.info(message)
        resolve(outcome)
      }

      let child: ChildProcess
      try {
        child = spawn(invocation.file, invocation.args, { stdio: "ignore", windowsHide: true, env: invocation.env })
      } catch (e: any) {
        settle("unavailable", `Cannot spawn PowerShell for UAC elevation: ${e.message}`)
        return
      }

      timer = setTimeout(() => {
        child.kill()
        settle("unavailable", `PowerShell elevation trampoline did not report within ${ELEVATION_TIMEOUT_MS / 1000}s, killing it`)
      }, ELEVATION_TIMEOUT_MS)

      child.once("error", (e: NodeJS.ErrnoException) => settle("unavailable", `Cannot spawn PowerShell for UAC elevation: ${e.code ?? e.message}`))
      child.once("exit", (code, signal) => {
        if (code === 0) {
          settle("launched", "PowerShell elevation trampoline exited with code 0")
        } else if (code === UAC_CANCELLED_EXIT_CODE) {
          settle("cancelled", `PowerShell elevation trampoline exited with code ${code}: the UAC prompt was declined`)
        } else {
          settle("unavailable", `PowerShell elevation trampoline exited with code ${code}${signal == null ? "" : ` (signal ${signal})`}`)
        }
      })
    })
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
      const downloadOptions: DifferentialDownloaderOptions = {
        newUrl: new URL(packageInfo.path),
        oldFile: path.join(this.downloadedUpdateHelper!.cacheDir, CURRENT_APP_PACKAGE_FILE_NAME),
        logger: this._logger,
        newFile: packagePath,
        requestHeaders: this.requestHeaders,
        isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
        cancellationToken: downloadUpdateOptions.cancellationToken,
      }

      if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
        downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
      }

      await new FileWithEmbeddedBlockMapDifferentialDownloader(packageInfo, this.httpExecutor, downloadOptions).download()
    } catch (e: any) {
      this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
      // during test (developer machine mac or linux) we must throw error
      return process.platform === "win32"
    }
    return false
  }
}
