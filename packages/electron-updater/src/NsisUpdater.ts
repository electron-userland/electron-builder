import { AllPublishOptions, newError, PackageFileInfo, CURRENT_APP_INSTALLER_FILE_NAME, CURRENT_APP_PACKAGE_FILE_NAME } from "builder-util-runtime"
import * as path from "path"
import * as childProcess from "child_process"
import { AppAdapter } from "./AppAdapter"
import { DownloadUpdateOptions } from "./AppUpdater"
import { BaseUpdater, InstallOptions } from "./BaseUpdater"
import { DifferentialDownloaderOptions } from "./differentialDownloader/DifferentialDownloader"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { DOWNLOAD_PROGRESS } from "./types"
import { VerifyUpdateCodeSignature } from "./main"
import { findFile, Provider } from "./providers/Provider"
import { unlink } from "fs-extra"
import { verifySignature } from "./windowsExecutableCodeSignatureVerifier"
import { URL } from "url"

type InstallMode = "allusers" | "currentuser"

interface ResolvedInstallMode {
  readonly mode: InstallMode | null
  readonly source: "admin-required" | "registry" | "path-fallback" | "none"
}

interface RegistryUninstallEntry {
  readonly installLocation?: string
  readonly displayIcon?: string
  readonly quietUninstallString?: string
  readonly uninstallString?: string
}

const REGISTRY_QUERY_TIMEOUT_MS = 5000
const REGISTRY_QUERY_MAX_BUFFER = 10 * 1024 * 1024

export class NsisUpdater extends BaseUpdater {
  /**
   * Specify custom install directory path
   *
   */
  installDirectory?: string

  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  protected _verifyUpdateCodeSignature: VerifyUpdateCodeSignature = (publisherNames: Array<string>, unescapedTempUpdateFile: string) =>
    verifySignature(publisherNames, unescapedTempUpdateFile, this._logger)

  /**
   * The verifyUpdateCodeSignature. You can pass [win-verify-signature](https://github.com/beyondkmp/win-verify-trust) or another custom verify function: ` (publisherName: string[], path: string) => Promise<string | null>`.
   * The default verify function uses [windowsExecutableCodeSignatureVerifier](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts)
   */
  get verifyUpdateCodeSignature(): VerifyUpdateCodeSignature {
    return this._verifyUpdateCodeSignature
  }

  set verifyUpdateCodeSignature(value: VerifyUpdateCodeSignature) {
    if (value) {
      this._verifyUpdateCodeSignature = value
    }
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "exe")!
    return this.executeDownload({
      fileExtension: "exe",
      downloadUpdateOptions,
      fileInfo,
      task: async (destinationFile, downloadOptions, packageFile, removeTempDirIfAny) => {
        const packageInfo = fileInfo.packageInfo
        const isWebInstaller = packageInfo != null && packageFile != null
        if (isWebInstaller && downloadUpdateOptions.disableWebInstaller) {
          throw newError(
            `Unable to download new version ${downloadUpdateOptions.updateInfoAndProvider.info.version}. Web Installers are disabled`,
            "ERR_UPDATER_WEB_INSTALLER_DISABLED"
          )
        }
        if (!isWebInstaller && !downloadUpdateOptions.disableWebInstaller) {
          this._logger.warn(
            "disableWebInstaller is set to false, you should set it to true if you do not plan on using a web installer. This will default to true in a future version."
          )
        }
        if (
          isWebInstaller ||
          downloadUpdateOptions.disableDifferentialDownload ||
          (await this.differentialDownloadInstaller(fileInfo, downloadUpdateOptions, destinationFile, provider, CURRENT_APP_INSTALLER_FILE_NAME))
        ) {
          await this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions)
        }

        const signatureVerificationStatus = await this.verifySignature(destinationFile)
        if (signatureVerificationStatus != null) {
          await removeTempDirIfAny()
          // noinspection ThrowInsideFinallyBlockJS
          throw newError(
            `New version ${downloadUpdateOptions.updateInfoAndProvider.info.version} is not signed by the application owner: ${signatureVerificationStatus}`,
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
                await unlink(packageFile)
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
  private async verifySignature(tempUpdateFile: string): Promise<string | null> {
    let publisherName: Array<string> | string | null
    try {
      publisherName = (await this.configOnDisk.value).publisherName
      if (publisherName == null) {
        return null
      }
    } catch (e: any) {
      if (e.code === "ENOENT") {
        // no app-update.yml
        return null
      }
      throw e
    }
    return await this._verifyUpdateCodeSignature(Array.isArray(publisherName) ? publisherName : [publisherName], tempUpdateFile)
  }

  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }

    const args = ["--updated"]
    if (options.isSilent) {
      args.push("/S")
    }

    const installMode = this.resolveInstallMode(options)
    if (installMode.mode != null) {
      args.push(`/${installMode.mode}`)
    }
    this._logger.info(`NSIS install mode: ${installMode.mode ?? "none"} (source: ${installMode.source})`)

    if (options.isForceRunAfter) {
      args.push("--force-run")
    }

    if (this.installDirectory) {
      // maybe check if folder exists
      args.push(`/D=${this.installDirectory}`)
    }

    const packagePath = this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.packageFile
    if (packagePath != null) {
      // only = form is supported
      args.push(`--package-file=${packagePath}`)
    }

    const callUsingElevation = (): void => {
      this.spawnLog(path.join(process.resourcesPath, "elevate.exe"), [installerPath].concat(args)).catch(e => this.dispatchError(e))
    }

    if (options.isAdminRightsRequired || installMode.mode === "allusers") {
      if (options.isAdminRightsRequired) {
        this._logger.info("isAdminRightsRequired is set to true, run installer using elevate.exe")
      } else {
        this._logger.info("NSIS install mode is allusers, run installer using elevate.exe")
      }
      callUsingElevation()
      return true
    }

    this.spawnLog(installerPath, args).catch((e: Error) => {
      // https://github.com/electron-userland/electron-builder/issues/1129
      // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
      const errorCode = (e as NodeJS.ErrnoException).code
      this._logger.info(
        `Cannot run installer: error code: ${errorCode}, error message: "${e.message}", will be executed again using elevate if EACCES, and will try to use electron.shell.openItem if ENOENT`
      )
      if (errorCode === "UNKNOWN" || errorCode === "EACCES") {
        callUsingElevation()
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

  private resolveInstallMode(options: InstallOptions): ResolvedInstallMode {
    if (options.isAdminRightsRequired) {
      return {
        mode: "allusers",
        source: "admin-required",
      }
    }

    const currentPlatform = this._testOnlyOptions?.platform ?? process.platform
    if (currentPlatform !== "win32") {
      return {
        mode: null,
        source: "none",
      }
    }

    try {
      const installModeFromRegistry = this.detectInstallModeFromRegistry(process.execPath)
      if (installModeFromRegistry != null) {
        return {
          mode: installModeFromRegistry,
          source: "registry",
        }
      }
    } catch (e: any) {
      this._logger.warn(`Cannot detect NSIS install mode from registry, fallback to path detection: ${e.message || e}`)
    }

    const installModeFromPath = this.detectInstallModeFromPath(process.execPath)
    if (installModeFromPath != null) {
      return {
        mode: installModeFromPath,
        source: "path-fallback",
      }
    }

    return {
      mode: null,
      source: "none",
    }
  }

  private detectInstallModeFromRegistry(executablePath: string): InstallMode | null {
    const executableDirectory = path.win32.dirname(executablePath)
    let weakMatchMode: InstallMode | null = null
    for (const queryArgs of this.getRegistryQueryArguments()) {
      for (const entry of this.parseUninstallRegistryEntries(this.queryRegistry(queryArgs))) {
        const installMode = this.parseInstallModeFromUninstallString(entry.quietUninstallString) || this.parseInstallModeFromUninstallString(entry.uninstallString)
        if (installMode == null) {
          continue
        }

        const matchConfidence = this.computeRegistryEntryMatchConfidence(entry, executablePath, executableDirectory)
        if (matchConfidence === 2) {
          return installMode
        }
        if (matchConfidence === 1) {
          weakMatchMode = installMode
        }
      }
    }
    return weakMatchMode
  }

  private getRegistryQueryArguments(): Array<Array<string>> {
    const keyPath = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
    return [
      ["query", `HKCU\\${keyPath}`, "/s"],
      ["query", `HKLM\\${keyPath}`, "/s", "/reg:64"],
      ["query", `HKLM\\${keyPath}`, "/s", "/reg:32"],
    ]
  }

  private queryRegistry(args: Array<string>): string {
    const response = childProcess.spawnSync("reg", args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: REGISTRY_QUERY_TIMEOUT_MS,
      maxBuffer: REGISTRY_QUERY_MAX_BUFFER,
    })
    if (response.error != null) {
      const error = response.error as NodeJS.ErrnoException
      if (error.code === "ETIMEDOUT") {
        throw new Error(`reg ${args.join(" ")} timed out after ${REGISTRY_QUERY_TIMEOUT_MS}ms`)
      }
      throw response.error
    }
    if (response.status !== 0) {
      return ""
    }
    return response.stdout
  }

  private parseUninstallRegistryEntries(output: string): Array<RegistryUninstallEntry> {
    const entries: Array<RegistryUninstallEntry> = []
    let currentEntry: { installLocation?: string; displayIcon?: string; quietUninstallString?: string; uninstallString?: string } | null = null

    for (const line of output.split(/\r?\n/)) {
      const trimmedLine = line.trim()
      if (trimmedLine.length === 0) {
        continue
      }

      if (!line.startsWith(" ") && !line.startsWith("\t")) {
        if (currentEntry != null) {
          entries.push(currentEntry)
        }
        currentEntry = {}
        continue
      }

      if (currentEntry == null) {
        continue
      }

      const valueMatch = /^([^\s]+)\s+REG_\w+\s*(.*)$/i.exec(trimmedLine)
      if (valueMatch == null) {
        continue
      }

      const valueName = valueMatch[1]
      const value = valueMatch[2]
      if (valueName === "InstallLocation") {
        currentEntry.installLocation = value
      } else if (valueName === "DisplayIcon") {
        currentEntry.displayIcon = value
      } else if (valueName === "QuietUninstallString") {
        currentEntry.quietUninstallString = value
      } else if (valueName === "UninstallString") {
        currentEntry.uninstallString = value
      }
    }

    if (currentEntry != null) {
      entries.push(currentEntry)
    }

    return entries
  }

  private computeRegistryEntryMatchConfidence(entry: RegistryUninstallEntry, executablePath: string, executableDirectory: string): number {
    if (entry.installLocation != null && this.isPathEqual(entry.installLocation, executableDirectory)) {
      return 2
    }

    if (entry.displayIcon != null) {
      const executablePathFromDisplayIcon = this.parseDisplayIconPath(entry.displayIcon)
      if (executablePathFromDisplayIcon != null && this.isPathEqual(executablePathFromDisplayIcon, executablePath)) {
        return 1
      }
    }

    return 0
  }

  private parseDisplayIconPath(displayIcon: string): string | null {
    const trimmedDisplayIcon = displayIcon.trim()
    if (trimmedDisplayIcon.length === 0) {
      return null
    }

    if (trimmedDisplayIcon.startsWith('"')) {
      const quoteEndIndex = trimmedDisplayIcon.indexOf('"', 1)
      if (quoteEndIndex > 1) {
        return trimmedDisplayIcon.substring(1, quoteEndIndex)
      }
    }

    const commaIndex = trimmedDisplayIcon.indexOf(",")
    return commaIndex === -1 ? trimmedDisplayIcon : trimmedDisplayIcon.substring(0, commaIndex)
  }

  private parseInstallModeFromUninstallString(uninstallString: string | undefined): InstallMode | null {
    if (uninstallString == null) {
      return null
    }
    if (/(^|\s)\/allusers(\s|$)/i.test(uninstallString)) {
      return "allusers"
    }
    if (/(^|\s)\/currentuser(\s|$)/i.test(uninstallString)) {
      return "currentuser"
    }
    return null
  }

  private detectInstallModeFromPath(executablePath: string): InstallMode | null {
    const localAppDataPath = this.getEnvironmentValue("LOCALAPPDATA")
    if (localAppDataPath != null && this.isPathInside(localAppDataPath, executablePath)) {
      return "currentuser"
    }

    for (const envKey of ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"] as const) {
      const programFilesPath = this.getEnvironmentValue(envKey)
      if (programFilesPath != null && this.isPathInside(programFilesPath, executablePath)) {
        return "allusers"
      }
    }

    return null
  }

  private getEnvironmentValue(name: string): string | undefined {
    const directMatch = process.env[name]
    if (directMatch != null) {
      return directMatch
    }
    const caseInsensitiveKey = Object.keys(process.env).find(it => it.toLowerCase() === name.toLowerCase())
    return caseInsensitiveKey == null ? undefined : process.env[caseInsensitiveKey]
  }

  private isPathInside(parentPath: string, childPath: string): boolean {
    try {
      const normalizedParent = this.normalizePath(parentPath)
      const normalizedChild = this.normalizePath(childPath)
      const relativePath = path.win32.relative(normalizedParent, normalizedChild)
      return relativePath === "" || (!relativePath.startsWith("..") && !path.win32.isAbsolute(relativePath))
    } catch {
      return false
    }
  }

  private isPathEqual(pathA: string, pathB: string): boolean {
    try {
      return this.normalizePath(pathA) === this.normalizePath(pathB)
    } catch {
      return false
    }
  }

  private normalizePath(input: string): string {
    return path.win32.resolve(input).replace(/[\\/]+$/, "").toLowerCase()
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
