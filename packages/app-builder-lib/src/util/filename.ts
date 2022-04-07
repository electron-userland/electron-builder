// @ts-ignore
import * as _sanitizeFileName from "sanitize-filename"
import * as path from "path"

export function sanitizeFileName(s: string): string {
  return _sanitizeFileName(s)
}

// Get the filetype from a filename. Returns a string of one or more file extensions,
// e.g. .zip, .dmg, .tar.gz, .tar.bz2, .exe.blockmap. We'd normally use `path.extname()`,
// but it doesn't support multiple extensions, e.g. Foo-1.0.0.dmg.blockmap should be
// .dmg.blockmap, not .blockmap.
export function getCompleteExtname(filename: string): string {
  let extname = path.extname(filename)

  switch (extname) {
    // Append leading extension for blockmap filetype
    case ".blockmap": {
      extname = path.extname(filename.replace(extname, "")) + extname

      break
    }
    // Append leading extension for known compressed tar formats
    case ".bz2":
    case ".gz":
    case ".lz":
    case ".xz":
    case ".7z": {
      const ext = path.extname(filename.replace(extname, ""))
      if (ext === ".tar") {
        extname = ext + extname
      }

      break
    }
  }

  return extname
}
