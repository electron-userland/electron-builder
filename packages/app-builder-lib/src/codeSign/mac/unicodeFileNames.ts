import { log, walk } from "builder-util"
import { rename } from "fs/promises"
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
 * @param root the app bundle to normalize in place; the root's own name is not changed
 * @returns the number of entries renamed
 */
export async function normalizeFileNamesToNfd(root: string): Promise<number> {
  // `walk` stats with `lstat`, so a symlink is listed as itself and never followed, and it omits the
  // root it was given — which is what we want, since the caller holds that path.
  const entries = await walk(root, null, { isIncludeDir: true, consume: () => null })

  // `walk` collects top-down, so a parent is renamed before the children whose paths it already
  // collected. macOS resolves those stale paths anyway — lookups ignore normalization, so a child
  // path spelled with the parent's precomposed name still opens after the parent is decomposed — but
  // that makes the rename order load-bearing on filesystem behavior. Rename the deepest entries first
  // instead. (The tests do not catch the unsorted version for exactly that reason; see the PR notes.)
  entries.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length)

  let renamed = 0
  for (const entry of entries) {
    const name = path.basename(entry)
    if (isAscii(name)) {
      continue
    }
    const normalized = name.normalize("NFD")
    if (normalized === name) {
      continue
    }
    try {
      await rename(entry, path.join(path.dirname(entry), normalized))
      renamed++
    } catch (e: any) {
      // signing still happens; the name stays precomposed and may break inside a DMG, so say so
      log.warn(
        { file: log.filePath(entry), error: e.message },
        "cannot normalize the file name to NFD — the code signature may be reported as damaged when the app is installed from a DMG"
      )
    }
  }
  return renamed
}
