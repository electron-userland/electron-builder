import { getPath7za } from "app-builder-lib/src/toolsets/7zip"
import { exec } from "builder-util"

// Lists entry paths inside any archive 7-Zip can read (.7z, .zip, .nupkg, …) using the technical
// listing (`-slt`), which prints one `Path = <entry>` line per entry — robust against entry names
// that contain spaces (column-splitting the human-readable table is not).
export async function listArchiveEntries(archivePath: string): Promise<Array<string>> {
  const stdout = await exec(await getPath7za(), ["l", "-slt", archivePath])
  const archiveAsEntry = archivePath.replace(/\\/g, "/")
  return stdout
    .split(/\r?\n/)
    .filter(line => line.startsWith("Path = "))
    .map(line => line.slice("Path = ".length).trim().replace(/\\/g, "/"))
    .filter(entry => entry.length > 0 && entry !== archiveAsEntry)
}

// True if the archive contains `entry` (matched as a full path or as a trailing path segment, so
// "resources/elevate.exe" matches "lib/net45/resources/elevate.exe" too).
export async function archiveContains(archivePath: string, entry: string): Promise<boolean> {
  const normalized = entry.replace(/\\/g, "/")
  const entries = await listArchiveEntries(archivePath)
  return entries.some(it => it === normalized || it.endsWith("/" + normalized))
}

// Branch/exec filters the self-vendored install-time Nsis7z decoder cannot read — every 7z filter
// except plain LZMA2/Copy and the single-stream BCJ filter the fix pins to. An NSIS app archive
// whose entries use any of these would have those entries silently dropped at install time (#9983).
// `BCJ` is intentionally excluded (word boundaries keep it from matching the unrelated `BCJ2`).
export const NON_DECODABLE_NSIS_FILTER = /\b(BCJ2|ARM64|ARMT|ARM|IA64|PPC|SPARC|DELTA)\b/

// Lists the 7-Zip codec/method strings reported for the archive (the `Method = …` lines of the
// technical listing — one per entry plus an archive-level summary). Used to assert that an NSIS app
// package contains no CPU branch filter the install-time Nsis7z decoder can't read (#9983).
export async function listArchiveMethods(archivePath: string): Promise<Array<string>> {
  const stdout = await exec(await getPath7za(), ["l", "-slt", archivePath])
  return stdout
    .split(/\r?\n/)
    .filter(line => line.startsWith("Method = "))
    .map(line => line.slice("Method = ".length).trim())
    .filter(method => method.length > 0)
}

// Returns the byte range [start, end) of each folder's packed streams, in folder (`Block`) order.
// In a 7z archive the folders' packed streams sit back-to-back, in folder order, right after the
// 32-byte signature header; the `-slt` listing reports a folder's packed size on its first file only
// (later files in a solid folder report an empty `Packed Size`, empty directories an empty `Block`).
export async function listArchiveFolderRanges(archivePath: string): Promise<Array<{ start: number; end: number }>> {
  const stdout = await exec(await getPath7za(), ["l", "-slt", archivePath])
  const folderSizes: Array<number> = []
  let packedSize = 0
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("Path = ")) {
      packedSize = 0
    } else if (line.startsWith("Packed Size = ")) {
      packedSize = parseInt(line.slice("Packed Size = ".length).trim(), 10) || 0
    } else if (line.startsWith("Block = ")) {
      const block = parseInt(line.slice("Block = ".length).trim(), 10)
      if (!Number.isNaN(block)) {
        folderSizes[block] = (folderSizes[block] ?? 0) + packedSize
      }
    }
  }
  let offset = 32
  return Array.from(folderSizes, (size = 0) => {
    const range = { start: offset, end: offset + size }
    offset += size
    return range
  })
}

// Maps each entry path to its reported codec (the `Path = …` line followed by that entry's
// `Method = …` line in the `-slt` technical listing). The archive-level summary block (whose Path
// is the archive file itself) is skipped. Entries stored with no compression report `Copy`.
export async function listArchiveEntryMethods(archivePath: string): Promise<Map<string, string>> {
  const stdout = await exec(await getPath7za(), ["l", "-slt", archivePath])
  const archiveAsEntry = archivePath.replace(/\\/g, "/")
  const result = new Map<string, string>()
  let current: string | null = null
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("Path = ")) {
      const entry = line.slice("Path = ".length).trim().replace(/\\/g, "/")
      current = entry === archiveAsEntry ? null : entry
    } else if (line.startsWith("Method = ") && current != null) {
      result.set(current, line.slice("Method = ".length).trim())
    }
  }
  return result
}
