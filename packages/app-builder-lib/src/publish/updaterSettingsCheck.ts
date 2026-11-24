import { Filter, log, statOrNull, walk, WalkSource } from "builder-util"
import type { Stats } from "fs"
import { lstat, readFile } from "fs/promises"
import * as path from "path"
import { readAsar } from "../asar/asar.js"
import type { Packager } from "../packager.js"
import { mayRequireCrossOriginHeaders, maySupportAllowUnverifiedLinuxPackages } from "../util/electronUpdaterCompatibility.js"
import { findAppElectronUpdater } from "../util/packageMetadata.js"

const CROSS_ORIGIN_HEADERS = "crossOriginHeaders"

/** An error code that only electron-updater's own code contains: a file with it bundles electron-updater, whose code mentions `crossOriginHeaders` itself. */
const BUNDLED_ELECTRON_UPDATER = "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED"

/**
 * An assignment of `crossOriginHeaders` on an object, formatted or minified (`e.crossOriginHeaders=()=>[]`), but not of `null` (electron-updater's
 * own `this.crossOriginHeaders = null`) and not a comparison (`===`, `==`).
 */
const CROSS_ORIGIN_HEADERS_ASSIGNMENT = /\.crossOriginHeaders\s*=(?![=>]|\s*null\b)/g

/**
 * `autoUpdater.allowUnverifiedLinuxPackages = false` as formatted code and as minifiers write it (`false` as `!1`). Not
 * `allowUnverifiedLinuxPackages=false`: electron-updater's own log messages contain it, so every app that bundles electron-updater would match.
 */
const DISALLOWS_UNVERIFIED_LINUX_PACKAGES = ["allowUnverifiedLinuxPackages = false", "allowUnverifiedLinuxPackages=!1"]

/** Larger files are not read: app code is far smaller, so these are data or assets. */
const MAX_SCANNED_FILE_SIZE = 20 * 1024 * 1024

/** Which electron-updater settings the files of the packed app mention. */
export interface UpdaterSettingsMentions {
  /** a file contains `crossOriginHeaders`; a file that bundles electron-updater, an assignment of it (see {@link setsCrossOriginHeaders}) */
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
 *   A file that bundles electron-updater mentions the property in electron-updater's own code, so in such a file only an assignment of it
 *   counts: an app that sets it in another way (e.g. `Object.assign`) in the same bundle gets the warning, which says to confirm it.
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
      "found no mention of crossOriginHeaders in the app's files (outside node_modules); in a file that bundles electron-updater, only an assignment " +
        "such as autoUpdater.crossOriginHeaders = () => [] counts, because electron-updater's own code mentions it. " +
        "Unless the app sets autoUpdater.crossOriginHeaders to a function, " +
        "electron-updater rejects every update check and download of the installed app with ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED. " +
        "If a dependency sets it, or the app sets it in another way, check for updates once from a packaged build to confirm. " +
        "See https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers"
    )
  }
  if (checkLinuxPackages && mentions.disallowsUnverifiedLinuxPackages) {
    linuxPackagesWarning.warn(
      {
        solution:
          "sign the .rpm files separately after the build (for example with rpm --addsign), then regenerate the sha512 and size of each signed file " +
          "in the Linux update manifest (latest-linux*.yml) and sign the manifest again: signing changes the files, so electron-updater rejects " +
          "a download that does not match the manifest written by the build. electron-builder sign-update-manifest --rehash does both for a manifest " +
          "(see https://www.electron.build/docs/features/signed-update-manifests#re-signing-after-a-file-changed); then run electron-builder verify to check the result",
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
  const mentions: UpdaterSettingsMentions = { crossOriginHeaders: false, disallowsUnverifiedLinuxPackages: false }
  const isFound = () => mentions.crossOriginHeaders && mentions.disallowsUnverifiedLinuxPackages
  // once every setting is found, nothing more is read
  const filter: Filter = (file, stat) => !isFound() && (stat.isDirectory() ? path.basename(file) !== "node_modules" : stat.isFile() && stat.size <= MAX_SCANNED_FILE_SIZE)
  const scan = (dir: string, read: (file: string) => Promise<Buffer>, source?: WalkSource) =>
    walk(
      dir,
      filter,
      {
        consume: async (file, stat) => {
          if (stat.isDirectory()) {
            return
          }
          const content = await read(file)
          mentions.crossOriginHeaders ||= content.includes(CROSS_ORIGIN_HEADERS) && (!content.includes(BUNDLED_ELECTRON_UPDATER) || setsCrossOriginHeaders(content.toString()))
          mentions.disallowsUnverifiedLinuxPackages ||= DISALLOWS_UNVERIFIED_LINUX_PACKAGES.some(it => content.includes(it))
        },
      },
      source
    )

  const asarFile = path.join(resourcesDir, "app.asar")
  if ((await statOrNull(asarFile))?.isFile()) {
    const asar = await readAsar(asarFile)
    const nodeOf = (file: string) => {
      const relative = path.relative(asarFile, file)
      return { relative, node: relative === "" ? asar.header : asar.getNode(relative) }
    }
    // an unpacked file is read from app.asar.unpacked, so it has the stats of that file; a link of app.asar has no size and is not a file
    const asarSource: WalkSource = {
      readdir: dir => Promise.resolve(Object.keys(nodeOf(dir).node?.files ?? {})),
      lstat: async file => {
        const { relative, node } = nodeOf(file)
        const isFile = node?.files == null && node?.link == null
        const unpacked = isFile && node?.unpacked === true ? await lstat(path.join(`${asarFile}.unpacked`, relative)).catch(() => null) : null
        return (
          unpacked ??
          ({
            isDirectory: () => node?.files != null,
            isFile: () => isFile && node?.unpacked !== true && node?.size != null,
            isSymbolicLink: () => node?.link != null,
            size: node?.size ?? 0,
          } as Stats)
        )
      },
    }
    await scan(asarFile, file => asar.readFile(path.relative(asarFile, file)), asarSource)
    return mentions
  }

  const appDir = path.join(resourcesDir, "app")
  if (!(await statOrNull(appDir))?.isDirectory()) {
    return null
  }
  await scan(appDir, file => readFile(file))
  return mentions
}

/**
 * Whether `code`, which bundles electron-updater, assigns `crossOriginHeaders` (see {@link CROSS_ORIGIN_HEADERS_ASSIGNMENT}) outside
 * electron-updater's own text: the assignment that its error message shows (after a backtick) and its JSDoc examples (in a comment line,
 * which an unminified bundle keeps). A line also starts after an escaped newline (`\n`): a source map's `sourcesContent` and a webpack
 * eval bundle hold the bundled code as strings, on one line.
 */
function setsCrossOriginHeaders(code: string): boolean {
  for (const match of code.matchAll(CROSS_ORIGIN_HEADERS_ASSIGNMENT)) {
    const escapedNewline = code.lastIndexOf("\\n", match.index)
    const line = code.slice(Math.max(code.lastIndexOf("\n", match.index) + 1, escapedNewline === -1 ? 0 : escapedNewline + 2), match.index)
    if (!/`[\w$.]*$/.test(line) && !/^\s*(?:\*|\/\/|\/\*)/.test(line)) {
      return true
    }
  }
  return false
}
