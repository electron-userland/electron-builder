// Lists the files of test cache directories (electron zips, electron-builder toolsets) so a job saves a new cache snapshot only when it
// downloaded something the restored one lacked. Paths are given one per argument or per line of an argument; a leading `~` is the home
// directory, as in actions/cache paths, and a missing directory counts as empty. In-flight download and lock entries are ignored.
//
//   node cache-files.mjs record <list-file> <paths...>   writes the current file list to <list-file>
//   node cache-files.mjs grown <list-file> <paths...>    prints a fingerprint of the current file list when it has files <list-file>
//                                                        lacks, and nothing otherwise
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import * as path from "node:path"

const IGNORED = /\.(lock|tmp)$/

function walk(root, dir, prefix, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (IGNORED.test(entry.name)) {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(root, full, prefix, out)
    } else if (entry.isFile()) {
      out.push(`${prefix}${path.relative(root, full).split(path.sep).join("/")}\t${statSync(full).size}`)
    }
  }
}

function listFiles(args) {
  const roots = args
    .flatMap(arg => arg.split(/\r?\n/))
    .map(it => it.trim())
    .filter(Boolean)
  const files = []
  for (const [index, root] of roots.entries()) {
    const dir = root.replace(/^~(?=$|[\\/])/, homedir())
    walk(dir, dir, `${index}:`, files)
  }
  return files.sort()
}

const [mode, listFile, ...roots] = process.argv.slice(2)
const files = listFiles(roots)
if (mode === "record") {
  writeFileSync(listFile, files.join("\n"))
} else if (mode === "grown") {
  const recorded = new Set(readFileSync(listFile, "utf8").split("\n"))
  if (files.some(file => !recorded.has(file))) {
    process.stdout.write(createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 16))
  }
} else {
  throw new Error(`unknown mode "${mode}" (expected "record" or "grown")`)
}
