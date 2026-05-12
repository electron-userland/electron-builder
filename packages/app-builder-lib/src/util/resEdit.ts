import { log } from "builder-util"
import { readFile, writeFile } from "fs/promises"
import { Data, NtExecutable, NtExecutableResource, Resource } from "resedit"
import { RequestedExecutionLevel } from "../options/winOptions"

export interface ResourceEditOptions {
  file: string
  versionStrings: Record<string, string>
  fileVersion: string
  productVersion: string
  requestedExecutionLevel?: RequestedExecutionLevel | null
  iconPath?: string | null
}

export async function editWindowsResources(opts: ResourceEditOptions): Promise<void> {
  const buffer = await readFile(opts.file)
  const executable = NtExecutable.from(buffer)
  const res = NtExecutableResource.from(executable)

  const viList = Resource.VersionInfo.fromEntries(res.entries)
  // Mirror rcedit: create version info from scratch if none exists; use first if multiple
  const vi = viList.length > 0 ? viList[0] : Resource.VersionInfo.createEmpty()
  // Mirror rcedit: default to en-US (1033) if no languages present; use first if multiple
  const languages = vi.getAllLanguagesForStringValues()
  const lang = languages.length > 0 ? languages[0] : { lang: 0x0409, codepage: 1200 }

  vi.setStringValues(lang, opts.versionStrings)
  vi.setFileVersion(opts.fileVersion)
  vi.setProductVersion(opts.productVersion)
  // resedit normalizes the string to 4-part numeric; restore the original (e.g. "1.1.0" or "3.0.0-beta.2")
  vi.setStringValues(lang, { FileVersion: opts.fileVersion })
  vi.outputToResourceEntries(res.entries)

  if (opts.iconPath) {
    const iconBuf = await readFile(opts.iconPath)
    const iconFile = Data.IconFile.from(iconBuf)
    Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,
      lang.lang,
      iconFile.icons.map(i => i.data)
    )
  }

  if (opts.requestedExecutionLevel && opts.requestedExecutionLevel !== "asInvoker") {
    const manifestEntry = res.entries.find(e => e.type === 24 && e.id === 1)
    if (!manifestEntry) {
      log.warn({ file: opts.file }, "no RT_MANIFEST resource found; requestedExecutionLevel will not be applied")
    } else {
      const originalXml = Buffer.from(manifestEntry.bin).toString("utf-8")
      const updatedXml = originalXml.replace(/(<requestedExecutionLevel[^>]*\blevel=")[^"]*(")/i, `$1${opts.requestedExecutionLevel}$2`)
      if (updatedXml === originalXml) {
        log.warn({ file: opts.file, requestedExecutionLevel: opts.requestedExecutionLevel }, "requestedExecutionLevel node not found in manifest; execution level not updated")
      } else {
        const newBuf = Buffer.from(updatedXml, "utf-8")
        manifestEntry.bin = newBuf.buffer.slice(newBuf.byteOffset, newBuf.byteOffset + newBuf.byteLength)
      }
    }
  }

  res.outputResource(executable)
  await writeFile(opts.file, Buffer.from(executable.generate()))
}
