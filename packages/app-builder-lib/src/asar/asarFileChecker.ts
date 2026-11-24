import * as asar from "@electron/asar"
import { log } from "builder-util"
import fs from "fs-extra"
import { describedArchiveSize, type Node, readAsarHeader } from "./asar.js"

// Entry types come from the return type of `statFile`.
type FilesystemEntry = ReturnType<typeof asar.statFile>
type FilesystemFileEntry = Extract<FilesystemEntry, { size: number }>

export interface ArchiveFileToCheck {
  /** path inside the archive */
  file: string
  /** names the file in errors, such as "Application entry file" */
  messagePrefix: string
}

let warnedHeaderPastEnd = false

/**
 * Checks that every file in `files` is in the archive with content, and that the archive's size matches the size its header describes.
 * The header is read once per call, so pass every file to check in the same archive together.
 */
export async function checkFilesInArchive(asarFile: string, files: Array<ArchiveFileToCheck>): Promise<void> {
  // `statFile` caches the header by path (https://github.com/electron/asar/blob/fde819a/src/disk.ts#L357-L365): drop an entry left from an earlier
  // build to the same path in this process, so its offsets are not compared with the size of the archive on disk now
  asar.uncache(asarFile)
  const stats = files.map(it => ({ ...it, stat: statFileInArchive(asarFile, it) }))

  // `statFile` reads only the 8-byte size prefix and the header: it calls `readFilesystemSync` (https://github.com/electron/asar/blob/fde819a/src/asar.ts#L341-L348),
  // which reads the header through `readArchiveHeaderSync` (https://github.com/electron/asar/blob/fde819a/src/disk.ts#L324-L346). An archive whose bytes
  // drifted from its header therefore still passes the checks above, so compare the archive size with the size the header describes.
  const { header, size: headerSize } = await readAsarHeader(asarFile)
  const actualSize = (await fs.stat(asarFile)).size
  const { size: expectedSize, sizeWithin } = describedArchiveSize(JSON.parse(header) as Node, headerSize, actualSize)
  // Bytes after the last entry that fits in the file are trailing bytes, even when other entries point past the end (bloat).
  if (actualSize > sizeWithin) {
    throw new Error(`"${asarFile}" is corrupted: the header describes an archive of ${sizeWithin} bytes, but it is ${actualSize} bytes`)
  }
  // An entry past the end of the file may be bloat, but not a file being checked: its content has to be inside the archive.
  for (const { file, messagePrefix, stat } of stats) {
    if (stat.offset != null && !stat.unpacked) {
      const fileEnd = 8 + headerSize + parseInt(stat.offset, 10) + stat.size
      if (fileEnd > actualSize) {
        throw archiveFileError(asarFile, { file, messagePrefix }, `is corrupted: its content ends at byte ${fileEnd}, but the archive is ${actualSize} bytes`)
      }
    }
  }
  if (actualSize < expectedSize && !warnedHeaderPastEnd) {
    warnedHeaderPastEnd = true
    // asarmor's default afterPack patch (createBloatPatch) adds header entries that point far past the end of the file on purpose,
    // so a header that describes more bytes than the file has only warns
    log.warn(
      { file: log.filePath(asarFile), headerBytes: expectedSize, archiveBytes: actualSize },
      `the header describes an archive of ${expectedSize} bytes, but it is ${actualSize} bytes; continuing. ` +
        "This is expected when an afterPack hook patches the header (such as asarmor); otherwise files other than the checked ones may be cut off. " +
        "Set asar.disableSanityCheck to skip this check"
    )
  }
}

function statFileInArchive(asarFile: string, it: ArchiveFileToCheck): FilesystemFileEntry {
  let stat: FilesystemEntry
  try {
    stat = asar.statFile(asarFile, it.file, false)
  } catch (e: any) {
    if (e.message.includes("Cannot read properties of undefined (reading 'link')")) {
      throw archiveFileError(asarFile, it, "does not exist. Seems like a wrong configuration.")
    }
    throw archiveFileError(asarFile, it, `is corrupted: ${e}`)
  }
  const fileStat = stat as FilesystemFileEntry
  if (fileStat.size === 0) {
    throw archiveFileError(asarFile, it, `is corrupted: size 0`)
  }
  return fileStat
}

function archiveFileError(asarFile: string, { file, messagePrefix }: ArchiveFileToCheck, text: string): Error {
  return new Error(`${messagePrefix} "${file}" in the "${asarFile}" ${text}`)
}
