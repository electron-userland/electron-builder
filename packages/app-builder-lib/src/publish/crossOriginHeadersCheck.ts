import { log } from "builder-util"
import type { Stats } from "fs"
import { lstat, readdir, readFile } from "fs/promises"
import * as path from "path"
import { Node, readAsar } from "../asar/asar.js"
import type { Packager } from "../packager.js"
import { mayRequireCrossOriginHeaders } from "../util/electronUpdaterCompatibility.js"
import { findAppElectronUpdater } from "../util/packageMetadata.js"

const PROPERTY = "crossOriginHeaders"

/** Larger files are not read: app code is far smaller, so these are data or assets. */
const MAX_SCANNED_FILE_SIZE = 20 * 1024 * 1024

/**
 * electron-updater rejects every update check and download of an installed app until the app sets `autoUpdater.crossOriginHeaders`
 * (`ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED`), which a developer who never runs the updater before a release does not see. The
 * updater cannot recover an app shipped that way, so the build warns when no file of the packed app (app.asar, its unpacked files, or
 * the app directory; not `node_modules`) contains the string `crossOriginHeaders`. Only for an app that ships an electron-updater that
 * may require it (see {@link mayRequireCrossOriginHeaders}), and once per process: after the warning, later builds skip the scan. It
 * never fails the build.
 *
 * Accepted trade-off: an app that bundles electron-updater into its own JavaScript contains the string anyway, so the check stays quiet
 * for bundled apps; it only catches apps that never mention the property.
 *
 * @internal exported for tests
 */
export async function warnIfCrossOriginHeadersNotMentioned(packager: Pick<Packager, "metadata" | "devMetadata" | "projectDir">, resourcesDir: string): Promise<void> {
  const warning = log.once("cross-origin-headers-not-mentioned")
  if (warning.isExhausted) {
    return
  }
  const updater = findAppElectronUpdater(packager.metadata, packager.devMetadata, packager.projectDir)
  if (updater == null || !mayRequireCrossOriginHeaders(updater)) {
    return
  }
  try {
    if ((await findCrossOriginHeadersMention(resourcesDir)) !== false) {
      return
    }
  } catch (e: any) {
    log.debug({ resourcesDir, error: e?.message ?? String(e) }, "cannot check whether the app sets autoUpdater.crossOriginHeaders")
    return
  }
  warning.warn(
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

/**
 * Whether a file of the app in `resourcesDir`, outside `node_modules`, contains `crossOriginHeaders`, or null when the resources hold
 * neither app.asar nor an app directory. The packed tree comes from the project, which is not trusted: only regular files are read,
 * never a symlink, and no file larger than {@link MAX_SCANNED_FILE_SIZE}. Rejects when app.asar cannot be read.
 *
 * @internal exported for tests
 */
export async function findCrossOriginHeadersMention(resourcesDir: string): Promise<boolean | null> {
  const lstatOrNull = (file: string) => lstat(file).catch(() => null)
  const isReadable = (stat: Stats | null) => stat != null && stat.isFile() && stat.size <= MAX_SCANNED_FILE_SIZE

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
        if ((await asar.readFile(file)).includes(PROPERTY)) {
          return true
        }
      }
      return false
    }
    return search(asar.header, "")
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
      } else if (isReadable(await lstatOrNull(file)) && (await readFile(file)).includes(PROPERTY)) {
        return true
      }
    }
  }
  return false
}
