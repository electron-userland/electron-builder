import { log } from "builder-util"
import type { Stats } from "fs"
import { lstat, readdir, readFile } from "fs/promises"
import * as path from "path"
import { Node, readAsar } from "../asar/asar.js"
import type { Packager } from "../packager.js"
import { mayRequireCrossOriginHeaders, maySupportAllowUnverifiedLinuxPackages } from "../util/electronUpdaterCompatibility.js"
import { findAppElectronUpdater } from "../util/packageMetadata.js"

const CROSS_ORIGIN_HEADERS = "crossOriginHeaders"

/**
 * `autoUpdater.allowUnverifiedLinuxPackages = false` as formatted code and as minifiers write it (`false` as `!1`). Not
 * `allowUnverifiedLinuxPackages=false`: electron-updater's own log messages contain it, so every app that bundles electron-updater would match.
 */
const DISALLOWS_UNVERIFIED_LINUX_PACKAGES = ["allowUnverifiedLinuxPackages = false", "allowUnverifiedLinuxPackages=!1"]

/** Larger files are not read: app code is far smaller, so these are data or assets. */
const MAX_SCANNED_FILE_SIZE = 20 * 1024 * 1024

/** Which electron-updater settings the files of the packed app mention. */
export interface UpdaterSettingsMentions {
  /** a file contains `crossOriginHeaders` */
  crossOriginHeaders: boolean
  /** a file contains `allowUnverifiedLinuxPackages = false` (see {@link DISALLOWS_UNVERIFIED_LINUX_PACKAGES}) */
  disallowsUnverifiedLinuxPackages: boolean
}

/**
 * Warns about electron-updater settings of the app that fail where a developer who never runs the updater before a release does not see
 * it. Each warning is once per process: after both, later builds skip the scan. It never fails the build.
 *
 * - electron-updater rejects every update check and download of an installed app until the app sets `autoUpdater.crossOriginHeaders`
 *   (`ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED`), and cannot recover an app shipped that way: warns when no file of the app contains
 *   the string `crossOriginHeaders`, for an app that ships an electron-updater that may require it (see {@link mayRequireCrossOriginHeaders}).
 *   Accepted trade-off: an app that bundles electron-updater into its own JavaScript contains the string anyway, so the check stays quiet
 *   for bundled apps; it only catches apps that never mention the property.
 * - With `autoUpdater.allowUnverifiedLinuxPackages = false`, an rpm update installs only when the package manager verifies its signature,
 *   and electron-builder does not sign Linux packages: warns, for a pack with an rpm target that writes update info (`packsRpmUpdate`) and an
 *   electron-updater that may honor the property, when a file of the app contains the assignment. It has no effect on deb, pacman or
 *   AppImage updates.
 *
 * `scan` returns the mentions of the packed app (see {@link findUpdaterSettingsMentions}); it is called only when a warning applies.
 *
 * @internal exported for tests
 */
export async function warnAboutUpdaterSettings(
  packager: Pick<Packager, "metadata" | "devMetadata" | "projectDir">,
  packsRpmUpdate: boolean,
  scan: () => Promise<UpdaterSettingsMentions | null>
): Promise<void> {
  const crossOriginHeadersWarning = log.once("cross-origin-headers-not-mentioned")
  const linuxPackagesWarning = log.once("unverified-linux-packages-disallowed")
  const checksLinuxPackages = packsRpmUpdate && !linuxPackagesWarning.isExhausted
  if (crossOriginHeadersWarning.isExhausted && !checksLinuxPackages) {
    return
  }
  const updater = findAppElectronUpdater(packager.metadata, packager.devMetadata, packager.projectDir)
  if (updater == null) {
    return
  }
  const checkCrossOriginHeaders = !crossOriginHeadersWarning.isExhausted && mayRequireCrossOriginHeaders(updater)
  const checkLinuxPackages = checksLinuxPackages && maySupportAllowUnverifiedLinuxPackages(updater)
  if (!checkCrossOriginHeaders && !checkLinuxPackages) {
    return
  }
  let mentions: UpdaterSettingsMentions | null
  try {
    mentions = await scan()
  } catch (e: any) {
    log.debug({ error: e?.message ?? String(e) }, "cannot check the app's electron-updater settings")
    return
  }
  if (mentions == null) {
    return
  }
  if (checkCrossOriginHeaders && !mentions.crossOriginHeaders) {
    crossOriginHeadersWarning.warn(
      {
        solution:
          "set autoUpdater.crossOriginHeaders to a function before the app checks for updates, e.g. autoUpdater.crossOriginHeaders = () => [] " +
          "to send none of the app's request headers to another origin than the update feed",
      },
      "found no mention of crossOriginHeaders in the app's files (outside node_modules). Unless the app sets autoUpdater.crossOriginHeaders to a function, " +
        "electron-updater rejects every update check and download of the installed app with ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED. " +
        "If a dependency sets it, check for updates once from a packaged build to confirm. " +
        "See https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers"
    )
  }
  if (checkLinuxPackages && mentions.disallowsUnverifiedLinuxPackages) {
    linuxPackagesWarning.warn(
      {
        solution:
          "sign the .rpm files separately after the build (for example with rpm --addsign), then regenerate the sha512 and size of each signed file " +
          "in the Linux update manifest (latest-linux*.yml) and sign the manifest again: signing changes the files, so electron-updater rejects " +
          "a download that does not match the manifest written by the build. Run electron-builder verify to check the result",
      },
      "the app sets autoUpdater.allowUnverifiedLinuxPackages = false, so electron-updater installs an .rpm update only when dnf/yum or zypper " +
        "verifies its GPG signature against a key in the rpm keyring of the target system. electron-builder does not sign Linux packages, " +
        "so an unsigned .rpm update fails to install. See https://www.electron.build/docs/features/auto-update#allowunverifiedlinuxpackages"
    )
  }
}

/**
 * Which electron-updater settings the files of the app in `resourcesDir` (app.asar, its unpacked files, or the app directory; not
 * `node_modules`) mention, in one pass with a plain string search, or null when the resources hold neither app.asar nor an app directory.
 * The packed tree comes from the project, which is not trusted: only regular files are read, never a symlink, and no file larger than
 * {@link MAX_SCANNED_FILE_SIZE}. Rejects when app.asar cannot be read.
 *
 * @internal exported for tests
 */
export async function findUpdaterSettingsMentions(resourcesDir: string): Promise<UpdaterSettingsMentions | null> {
  const lstatOrNull = (file: string) => lstat(file).catch(() => null)
  const isReadable = (stat: Stats | null) => stat != null && stat.isFile() && stat.size <= MAX_SCANNED_FILE_SIZE
  const mentions: UpdaterSettingsMentions = { crossOriginHeaders: false, disallowsUnverifiedLinuxPackages: false }
  /** Records what `content` mentions; true once every setting is found, so the scan can stop. */
  const record = (content: Buffer): boolean => {
    mentions.crossOriginHeaders ||= content.includes(CROSS_ORIGIN_HEADERS)
    mentions.disallowsUnverifiedLinuxPackages ||= DISALLOWS_UNVERIFIED_LINUX_PACKAGES.some(it => content.includes(it))
    return mentions.crossOriginHeaders && mentions.disallowsUnverifiedLinuxPackages
  }

  const asarFile = path.join(resourcesDir, "app.asar")
  if ((await lstatOrNull(asarFile))?.isFile()) {
    const asar = await readAsar(asarFile)
    const search = async (dir: Node, dirPath: string): Promise<boolean> => {
      for (const [name, node] of Object.entries(dir.files ?? {})) {
        const file = path.join(dirPath, name)
        if (node.files != null) {
          if (name !== "node_modules" && (await search(node, file))) {
            return true
          }
          continue
        }
        // a link has no size, so it is not read; an unpacked file is read from app.asar.unpacked
        if (node.size == null || node.size > MAX_SCANNED_FILE_SIZE || (node.unpacked === true && !isReadable(await lstatOrNull(path.join(`${asarFile}.unpacked`, file))))) {
          continue
        }
        if (record(await asar.readFile(file))) {
          return true
        }
      }
      return false
    }
    await search(asar.header, "")
    return mentions
  }

  const appDir = path.join(resourcesDir, "app")
  if (!(await lstatOrNull(appDir))?.isDirectory()) {
    return null
  }
  const pending = [appDir]
  for (let dir = pending.pop(); dir != null; dir = pending.pop()) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") {
          pending.push(file)
        }
      } else if (isReadable(await lstatOrNull(file)) && record(await readFile(file))) {
        return mentions
      }
    }
  }
  return mentions
}
