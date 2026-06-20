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
