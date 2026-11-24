import { log, orIfFileNotExist, orNullIfFileNotExist } from "builder-util"
import { lstat, readdir, rename } from "fs/promises"
import * as path from "path"

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
 * Children are renamed before their directory (post-order), so every path used is still valid when it
 * is used. Symlinks are renamed as themselves and never followed (`Dirent` is `lstat`-based).
 *
 * @param dir the app bundle to normalize in place; the directory's own name is not changed
 */
export async function normalizeFileNamesToNfd(dir: string): Promise<void> {
  for (const entry of await orIfFileNotExist(readdir(dir, { withFileTypes: true }), [])) {
    const from = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await normalizeFileNamesToNfd(from)
    }
    const nfd = entry.name.normalize("NFD")
    if (nfd === entry.name) {
      continue
    }
    const to = path.join(dir, nfd)
    try {
      const [src, dst] = await Promise.all([lstat(from), orNullIfFileNotExist(lstat(to))])
      // on APFS/HFS+ lstat(to) resolves to `from` itself; a different inode is a real sibling that `rename` would clobber
      if (dst != null && (dst.ino !== src.ino || dst.dev !== src.dev)) {
        log.warn({ file: log.filePath(from) }, "not normalizing the file name to NFD: a sibling already has the decomposed name")
        continue
      }
      await rename(from, to)
    } catch (e: any) {
      // signing still happens; the name stays precomposed and may break inside a DMG, so say so
      log.warn(
        { file: log.filePath(from), error: e.message },
        "cannot normalize the file name to NFD — the code signature may be reported as damaged when the app is installed from a DMG"
      )
    }
  }
}
