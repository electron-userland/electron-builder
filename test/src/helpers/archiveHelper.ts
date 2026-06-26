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
