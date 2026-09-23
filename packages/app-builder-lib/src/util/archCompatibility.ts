import { Arch } from "builder-util"
import { createHash } from "crypto"
import { open, readdir, readFile } from "fs/promises"
import * as path from "path"

/**
 * The `cpu`/`os` constraint fields as declared in a package's `package.json`.
 * npm/pnpm only *install* the optional platform package matching the host, but the
 * declared values are what we use to decide whether a package belongs in a given build.
 */
export interface PackagePlatformFields {
  os?: string | string[] | null
  cpu?: string | string[] | null
}

// Maps electron-builder's `Arch` to the npm `cpu` token used in `package.json` `cpu` fields.
// Returns `null` for arches we don't filter on (e.g. `universal`).
export function archToNodeCpu(arch: Arch): string | null {
  switch (arch) {
    case Arch.ia32:
      return "ia32"
    case Arch.x64:
      return "x64"
    case Arch.armv7l:
      return "arm"
    case Arch.arm64:
      return "arm64"
    default:
      return null
  }
}

function toList(value: string | string[] | null | undefined): string[] | null {
  if (value == null) {
    return null
  }
  const list = Array.isArray(value) ? value : [value]
  return list.length > 0 ? list : null
}

// Mirrors npm's `checkList` semantics (npm-install-checks): supports `"any"` and `"!"` negation.
// Returns true when `value` is allowed by `list`.
function checkList(value: string, list: string[]): boolean {
  if (list.length === 1 && list[0] === "any") {
    return true
  }
  let blacklistCount = 0
  let match = false
  for (const entry of list) {
    if (entry.startsWith("!")) {
      if (entry.slice(1) === value) {
        return false
      }
      blacklistCount++
    } else if (entry === value) {
      match = true
    }
  }
  // allowed if it matched a positive entry, or every entry was a (non-matching) negation
  return match || blacklistCount === list.length
}

/**
 * Whether a package may be bundled for the given target `cpu`/`os`, per its declared
 * `package.json` `cpu`/`os` fields. A package with no constraint (plain JS) is always compatible.
 */
export function isPackageCompatible(pkg: PackagePlatformFields, targetCpu: string | null, targetOs: string): boolean {
  const os = toList(pkg.os)
  if (os != null && !checkList(targetOs, os)) {
    return false
  }
  const cpu = toList(pkg.cpu)
  if (targetCpu != null && cpu != null && !checkList(targetCpu, cpu)) {
    return false
  }
  return true
}

/**
 * Whether a package is inherently single-architecture — i.e. its `cpu` constraint cannot satisfy
 * *both* slices of a macOS universal build (`x64` and `arm64`). Such packages (e.g. `@esbuild/darwin-arm64`)
 * cannot be merged into a universal Mach-O and must be treated as single-arch by `@electron/universal`.
 */
export function isSingleArchPackage(pkg: PackagePlatformFields): boolean {
  const cpu = toList(pkg.cpu)
  if (cpu == null) {
    return false
  }
  return !(checkList("x64", cpu) && checkList("arm64", cpu))
}

/**
 * Recursively walks a `node_modules` directory (handling `@scope` dirs and nested `node_modules`) and
 * collects the `name` of every package whose `package.json` `cpu` marks it as {@link isSingleArchPackage single-arch}.
 * Missing/unreadable directories are treated as empty.
 */
export async function collectSingleArchPackageNames(nodeModulesDir: string, names: Set<string> = new Set<string>()): Promise<Set<string>> {
  let entries
  try {
    entries = await readdir(nodeModulesDir, { withFileTypes: true })
  } catch {
    return names // directory does not exist (no unpacked node_modules) or is unreadable
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin") {
      continue
    }
    if (entry.name.startsWith("@")) {
      // scope directory: its children are the actual packages
      const scopeDir = path.join(nodeModulesDir, entry.name)
      let scoped
      try {
        scoped = await readdir(scopeDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const child of scoped) {
        if (child.isDirectory()) {
          await inspectPackageDir(path.join(scopeDir, child.name), names)
        }
      }
    } else {
      await inspectPackageDir(path.join(nodeModulesDir, entry.name), names)
    }
  }
  return names
}

async function inspectPackageDir(packageDir: string, names: Set<string>): Promise<void> {
  try {
    const pkg: PackagePlatformFields & { name?: string } = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"))
    if (pkg.name && isSingleArchPackage(pkg)) {
      names.add(pkg.name)
    }
  } catch {
    // missing/invalid package.json — skip
  }
  await collectSingleArchPackageNames(path.join(packageDir, "node_modules"), names)
}

// Single-arch (non-fat) Mach-O magics, read big-endian from the first 4 bytes. The fat/universal magics
// (`0xcafebabe`/`0xbebafeca`) are intentionally excluded — those are already-merged binaries that lipo handles.
const SINGLE_ARCH_MACHO_MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe])

async function isSingleArchMachO(file: string): Promise<boolean> {
  let fh
  try {
    fh = await open(file, "r")
    const buf = Buffer.alloc(4)
    const { bytesRead } = await fh.read(buf, 0, 4, 0)
    return bytesRead === 4 && SINGLE_ARCH_MACHO_MAGICS.has(buf.readUInt32BE(0))
  } catch {
    return false // missing/unreadable file
  } finally {
    await fh?.close()
  }
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex")
}

async function walkFiles(dir: string, onFile: (absolutePath: string) => Promise<void>): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // directory does not exist or is unreadable
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(p, onFile)
    } else if (entry.isFile()) {
      await onFile(p)
    }
  }
}

/**
 * Finds single-arch Mach-O files that are byte-identical in BOTH universal slices — the exact case
 * `@electron/universal` aborts on (`x64Sha === arm64Sha` for a non-fat Mach-O). This catches host binaries
 * placed in packages that declare no `cpu`/`os`, e.g. esbuild's install script overwriting `esbuild/bin/esbuild`
 * with the platform binary. Per-arch binaries (different SHA, e.g. rebuilt `.node` addons) are left for lipo.
 * Returns paths relative to `unpackedDirA`, posix-normalized for matching by `@electron/universal`.
 */
export async function collectIdenticalSingleArchMachOFiles(unpackedDirA: string, unpackedDirB: string): Promise<string[]> {
  const result: string[] = []
  await walkFiles(unpackedDirA, async fileA => {
    if (!(await isSingleArchMachO(fileA))) {
      return
    }
    const rel = path.relative(unpackedDirA, fileA)
    const fileB = path.join(unpackedDirB, rel)
    if ((await isSingleArchMachO(fileB)) && (await sha256(fileA)) === (await sha256(fileB))) {
      result.push(rel.split(path.sep).join("/"))
    }
  })
  return result
}

/**
 * Combines the given minimatch patterns (as consumed by `@electron/universal`'s `singleArchFiles`) into a
 * single pattern, merged with any user-provided pattern. Returns `userPattern` (possibly undefined) when empty.
 */
export function buildSingleArchFilesPattern(patterns: Iterable<string>, userPattern: string | undefined): string | undefined {
  const sorted = Array.from(new Set(patterns)).sort()
  if (sorted.length === 0) {
    return userPattern
  }
  const detected = sorted.length === 1 ? sorted[0] : `{${sorted.join(",")}}`
  return userPattern ? `{${userPattern},${detected}}` : detected
}
