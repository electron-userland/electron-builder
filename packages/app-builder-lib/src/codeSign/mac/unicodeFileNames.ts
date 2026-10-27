import { log } from "builder-util"
import { lstat, readdir, rename } from "fs/promises"
import * as path from "path"

/** Fast path: a pure ASCII name can never change under Unicode normalization, and most names are. */
function isAscii(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 0x7f) {
      return false
    }
  }
  return true
}

/**
 * An HFS+ volume stores file names in the canonical decomposed form (NFD) and rewrites every name it
 * receives, which is what a DMG is formatted as under `dmg.filesystem: "HFS+"`. APFS, the current
 * default, keeps whichever form it is given. `codesign` seals the names it finds on disk into
 * `_CodeSignature/CodeResources`, so a bundle entry carrying a precomposed (NFC) name is sealed under
 * a name that no longer exists once the app ships inside an HFS+ DMG. Gatekeeper then rejects the app
 * with `a sealed resource is missing or invalid`, which the user sees as "the application is damaged
 * and can't be opened".
 *
 * This is invisible to whoever built the app: `codesign --verify --deep --strict` passes right after
 * signing, notarization succeeds, and the artifact checksum matches. Only the machine that installs
 * from the DMG sees a broken app.
 *
 * Any non-ASCII name that is not already decomposed is affected — Korean (`설명서.txt`), the
 * decomposable Japanese kana (`が`, `パ`), accented Latin (`café.txt`) — whether it arrived through
 * `extraResources`, `extraFiles`, `asarUnpack` or an `afterPack` hook.
 *
 * Normalizing to NFD before signing leaves an HFS+ volume nothing to rewrite, and APFS carries the
 * decomposed name through unchanged. Lookups on both are normalization-insensitive, so code that opens
 * the file under its precomposed name keeps working.
 *
 * Renaming is bottom-up: a directory renamed before its children would invalidate the paths used to
 * reach them. The bundle root itself is left alone — the caller holds that path.
 *
 * @param root the app bundle to normalize in place; the root's own name is not changed
 * @returns the number of entries renamed
 */
export async function normalizeFileNamesToNfd(root: string): Promise<number> {
  let renamed = 0

  const walk = async (dir: string): Promise<void> => {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch (e: any) {
      // a bundle is not expected to be unreadable, but an unreadable directory must not fail the build
      log.debug({ directory: dir, error: e.message }, "cannot list directory while normalizing file names")
      return
    }

    // children first — see the note on bottom-up renaming above
    for (const name of entries) {
      const entry = path.join(dir, name)
      try {
        // lstat, not stat: a symlink is renamed like any other entry, never followed
        if ((await lstat(entry)).isDirectory()) {
          await walk(entry)
        }
      } catch {
        // vanished between readdir and lstat — nothing to rename
      }
    }

    for (const name of entries) {
      if (isAscii(name)) {
        continue
      }
      const normalized = name.normalize("NFD")
      if (normalized === name) {
        continue
      }
      try {
        await rename(path.join(dir, name), path.join(dir, normalized))
        renamed++
      } catch (e: any) {
        // signing still happens; the name stays precomposed and may break inside a DMG, so say so
        log.warn(
          { file: log.filePath(path.join(dir, name)), error: e.message },
          "cannot normalize the file name to NFD — the code signature may be reported as damaged when the app is installed from a DMG"
        )
      }
    }
  }

  await walk(root)
  return renamed
}
