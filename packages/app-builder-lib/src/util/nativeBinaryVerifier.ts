import { Arch, log } from "builder-util"
import { open, readdir, readFile } from "fs/promises"
import * as path from "path"
import { AsarFilesystem, Node, readAsar } from "../asar/asar.js"
import { archToNodeCpu, isPackageCompatible, PackagePlatformFields } from "./archCompatibility.js"

/** Container format of a native binary, as identified by its magic bytes. */
export type NativeBinaryFormat = "elf" | "macho" | "pe"

/** What a native binary's header says it was built for. `arches` holds Node.js `process.arch` names (`x64`, `arm64`, `ia32`, `arm`) or `unknown(0x…)`. */
export interface NativeBinaryInfo {
  readonly format: NativeBinaryFormat
  /** Every architecture the file contains — more than one only for a Mach-O fat/universal binary. */
  readonly arches: ReadonlyArray<string>
}

/** Enough to cover the ELF/Mach-O headers, every `fat_arch` entry and the PE header of any real-world binary. */
const HEAD_READ_LENGTH = 4096

// ELF: https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.eheader.html
const ELF_EI_DATA = 5
const ELF_E_MACHINE = 18
const ELF_MACHINES: Record<number, string> = { 3: "ia32", 40: "arm", 62: "x64", 183: "arm64" }

// Mach-O: <mach-o/loader.h>, <mach-o/fat.h>, <mach/machine.h>
const MACHO_THIN_MAGIC_BE = new Set([0xfeedface, 0xfeedfacf])
const MACHO_THIN_MAGIC_LE = new Set([0xcefaedfe, 0xcffaedfe])
const MACHO_FAT_MAGIC = 0xcafebabe
const MACHO_FAT_MAGIC_64 = 0xcafebabf
/** A fat header has fewer than 30 slices, whereas a Java class file (same `0xcafebabe` magic) has a `major_version` of at least 45 there. */
const MACHO_FAT_MAX_ARCH_COUNT = 30
const MACHO_CPU_TYPES: Record<number, string> = { 7: "ia32", 0x01000007: "x64", 12: "arm", 0x0100000c: "arm64" }

// PE: https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
const PE_E_LFANEW = 0x3c
const PE_SIGNATURE = 0x00004550 // "PE\0\0" read little-endian
const PE_MACHINES: Record<number, string> = { 0x14c: "ia32", 0x8664: "x64", 0x1c4: "arm", 0xaa64: "arm64" }

function machineName(table: Record<number, string>, value: number): string {
  return table[value] ?? `unknown(0x${value.toString(16)})`
}

/**
 * Identifies an ELF, Mach-O (thin or fat) or PE binary from the first bytes of a file and reports the
 * architecture(s) it was built for. Returns `null` for anything else — including a truncated header — so
 * callers treat unrecognized files as "not a native binary".
 */
export function parseNativeBinaryHeader(head: Buffer): NativeBinaryInfo | null {
  if (head.length < 4) {
    return null
  }

  if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
    if (head.length < ELF_E_MACHINE + 2) {
      return null
    }
    const littleEndian = head[ELF_EI_DATA] !== 2
    const machine = littleEndian ? head.readUInt16LE(ELF_E_MACHINE) : head.readUInt16BE(ELF_E_MACHINE)
    return { format: "elf", arches: [machineName(ELF_MACHINES, machine)] }
  }

  const magic = head.readUInt32BE(0)
  if (MACHO_THIN_MAGIC_BE.has(magic) || MACHO_THIN_MAGIC_LE.has(magic)) {
    if (head.length < 8) {
      return null
    }
    const cpuType = MACHO_THIN_MAGIC_BE.has(magic) ? head.readUInt32BE(4) : head.readUInt32LE(4)
    return { format: "macho", arches: [machineName(MACHO_CPU_TYPES, cpuType)] }
  }
  if (magic === MACHO_FAT_MAGIC || magic === MACHO_FAT_MAGIC_64) {
    if (head.length < 8) {
      return null
    }
    const count = head.readUInt32BE(4)
    const entrySize = magic === MACHO_FAT_MAGIC_64 ? 32 : 20
    if (count === 0 || count >= MACHO_FAT_MAX_ARCH_COUNT || head.length < 8 + count * entrySize) {
      return null
    }
    const arches: string[] = []
    for (let i = 0; i < count; i++) {
      arches.push(machineName(MACHO_CPU_TYPES, head.readUInt32BE(8 + i * entrySize)))
    }
    return { format: "macho", arches }
  }

  if (head[0] === 0x4d && head[1] === 0x5a) {
    if (head.length < PE_E_LFANEW + 4) {
      return null
    }
    const peOffset = head.readUInt32LE(PE_E_LFANEW)
    if (peOffset + 6 > head.length || head.readUInt32LE(peOffset) !== PE_SIGNATURE) {
      return null
    }
    return { format: "pe", arches: [machineName(PE_MACHINES, head.readUInt16LE(peOffset + 4))] }
  }

  return null
}

const PLATFORM_FORMAT: Partial<Record<NodeJS.Platform, NativeBinaryFormat>> = { darwin: "macho", linux: "elf", win32: "pe" }
const FORMAT_LABEL: Record<NativeBinaryFormat, string> = { elf: "ELF", macho: "Mach-O", pe: "PE" }

/** Whether the binary can be loaded by an app for the given platform (`process.platform`) and cpu (`process.arch`). */
export function isNativeBinaryCompatible(info: NativeBinaryInfo, platform: NodeJS.Platform, cpu: string): boolean {
  return PLATFORM_FORMAT[platform] === info.format && info.arches.includes(cpu)
}

export function describeNativeBinary(info: NativeBinaryInfo): string {
  return `${FORMAT_LABEL[info.format]} ${info.arches.join("+")}`
}

// Path segments that say which platform/arch a file is for: prebuildify `prebuilds/linux-arm64/`, node-pre-gyp
// `napi-v6-linux-glibc-x64/`, platform packages such as `@img/sharp-darwin-arm64`, or `win/x64/` tool layouts.
const PLATFORM_TOKENS: Record<string, string> = {
  darwin: "darwin",
  mac: "darwin",
  macos: "darwin",
  osx: "darwin",
  linux: "linux",
  win32: "win32",
  win: "win32",
  windows: "win32",
  freebsd: "freebsd",
  openbsd: "openbsd",
  android: "android",
  sunos: "sunos",
  aix: "aix",
}
const ARCH_TOKENS: Record<string, string> = {
  x64: "x64",
  amd64: "x64",
  arm64: "arm64",
  aarch64: "arm64",
  ia32: "ia32",
  x86: "ia32",
  i386: "ia32",
  i686: "ia32",
  arm: "arm",
  armv6: "arm",
  armv6l: "arm",
  armv7: "arm",
  armv7l: "arm",
  armhf: "arm",
  universal: "universal",
}

/**
 * The platform/arch a relative path declares through its directory or package names, if any. A segment only
 * counts when it pairs a platform with an arch (`linux-x64`, `sharp-darwin-arm64`) or is exactly one token
 * (`win`, `x64`), so package names such as `node-mac-permissions` are not mistaken for a platform variant.
 *
 * @internal Exported for tests only.
 */
export function platformDeclaredByPath(relativePath: string): { platform?: string; cpu?: string } {
  const result: { platform?: string; cpu?: string } = {}
  const segments = relativePath.split(/[\\/]/)
  segments.pop() // the file name itself (e.g. `node.napi.armv7.node`) is not a directory layout
  for (const segment of segments) {
    const tokens = segment
      .toLowerCase()
      .replace(/x86[-_]64/g, "x64")
      .replace(/x64\+arm64|arm64\+x64/g, "universal") // prebuildify's name for a fat macOS prebuild
      .split(/[-_.]/)
    const platform = tokens.map(t => PLATFORM_TOKENS[t]).find(it => it != null)
    const cpu = tokens.map(t => ARCH_TOKENS[t]).find(it => it != null)
    if (tokens.length === 1 || (platform != null && cpu != null)) {
      result.platform = platform ?? result.platform
      result.cpu = cpu ?? result.cpu
    }
  }
  return result
}

/**
 * The package directory (relative, `node_modules/<name>` or `node_modules/@scope/<name>`) owning a file, or `null`
 * when the file is not inside `node_modules`.
 */
function packageRootOf(relativePath: string): string | null {
  const segments = relativePath.split(/[\\/]/)
  const index = segments.lastIndexOf("node_modules")
  if (index < 0 || index + 2 >= segments.length) {
    return null
  }
  const nameLength = segments[index + 1].startsWith("@") ? 2 : 1
  if (index + 1 + nameLength >= segments.length) {
    return null
  }
  return segments.slice(0, index + 1 + nameLength).join("/")
}

/** Where a candidate file lives, and how to read its header and its package's `package.json`. */
interface NativeBinarySource {
  readonly label: string
  list(): Promise<Array<string>>
  readHead(relativePath: string): Promise<Buffer | null>
  readPackageJson(packageRoot: string): Promise<PackagePlatformFields | null>
}

export type NativeBinaryKind = "addon" | "library"

export interface NativeBinaryMismatch {
  /** Path inside the packaged app, e.g. `app.asar.unpacked/node_modules/foo/build/Release/foo.node`. */
  readonly file: string
  readonly kind: NativeBinaryKind
  readonly detected: NativeBinaryInfo
}

const LIBRARY_EXTENSIONS = new Set([".dll", ".exe", ".dylib", ".so"])

/** `.node` addons are what `require()` loads; other native files are classified as libraries/executables, or skipped. */
function classify(file: string, allowExtensionless: boolean): NativeBinaryKind | null {
  const base = path.basename(file)
  const ext = path.extname(base).toLowerCase()
  if (ext === ".node") {
    return "addon"
  }
  if (LIBRARY_EXTENSIONS.has(ext) || /\.so(\.\d+)+$/.test(base)) {
    return "library"
  }
  // extensionless files are checked by magic bytes (bundled CLI tools such as esbuild's binary); only on disk,
  // where reading the head of a file is cheap — smart unpack moves such executables out of the asar anyway
  return allowExtensionless && ext === "" && !base.startsWith(".") ? "library" : null
}

async function readFileHead(file: string): Promise<Buffer | null> {
  let handle
  try {
    handle = await open(file, "r")
    const head = Buffer.alloc(HEAD_READ_LENGTH)
    const { bytesRead } = await handle.read(head, 0, HEAD_READ_LENGTH, 0)
    return head.subarray(0, bytesRead)
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

async function readJsonOrNull(file: string): Promise<any> {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch {
    return null
  }
}

async function listFiles(dir: string, prefix = ""): Promise<Array<string>> {
  let entries
  try {
    entries = await readdir(path.join(dir, prefix), { withFileTypes: true })
  } catch {
    return []
  }
  const result: string[] = []
  for (const entry of entries) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      result.push(...(await listFiles(dir, rel)))
    } else if (entry.isFile()) {
      result.push(rel)
    }
  }
  return result
}

/** @internal Exported for tests only. */
export function directorySource(dir: string, label: string): NativeBinarySource {
  return {
    label,
    list: () => listFiles(dir),
    readHead: rel => readFileHead(path.join(dir, rel)),
    readPackageJson: root => readJsonOrNull(path.join(dir, root, "package.json")),
  }
}

function collectAsarFiles(node: Node, prefix: string, out: Array<string>) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const rel = prefix === "" ? name : `${prefix}/${name}`
    if (child.files != null) {
      collectAsarFiles(child, rel, out)
    } else if (child.link == null && !child.unpacked) {
      out.push(rel) // unpacked files are covered by the `app.asar.unpacked` directory source
    }
  }
}

async function readAsarFileHead(archive: AsarFilesystem, rel: string): Promise<Buffer | null> {
  const node = archive.getNode(rel.split("/").join(path.sep))
  if (node == null || node.offset == null || !node.size) {
    return null
  }
  let handle
  try {
    handle = await open(archive.src, "r")
    const head = Buffer.alloc(Math.min(HEAD_READ_LENGTH, node.size))
    const { bytesRead } = await handle.read(head, 0, head.length, 8 + archive.headerSize + parseInt(node.offset, 10))
    return head.subarray(0, bytesRead)
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

async function asarSource(archivePath: string, label: string): Promise<NativeBinarySource | null> {
  let archive: AsarFilesystem
  try {
    archive = await readAsar(archivePath)
  } catch {
    return null
  }
  return {
    label,
    list: () => {
      const files: string[] = []
      collectAsarFiles(archive.header, "", files)
      return Promise.resolve(files)
    },
    readHead: rel => readAsarFileHead(archive, rel),
    readPackageJson: async root => {
      const onDisk = await readJsonOrNull(path.join(`${archivePath}.unpacked`, root, "package.json"))
      if (onDisk != null) {
        return onDisk
      }
      try {
        return await archive.readJson(path.join(...root.split("/"), "package.json"))
      } catch {
        return null
      }
    },
  }
}

/**
 * Scans the given sources for native binaries that were not built for `platform`/`cpu`. Files whose package declares
 * another platform (`package.json` `os`/`cpu`) or whose path names another platform/arch are skipped: they are
 * shipped on purpose (multi-platform prebuilds, a universal build's single-arch packages) and never loaded here.
 *
 * @internal Exported for tests only.
 */
export async function findNativeBinaryMismatches(
  sources: ReadonlyArray<NativeBinarySource>,
  platform: NodeJS.Platform,
  cpu: string,
  options: { extensionless: boolean[] } = { extensionless: sources.map(() => true) }
): Promise<Array<NativeBinaryMismatch>> {
  const mismatches: NativeBinaryMismatch[] = []
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    const packageCompatibility = new Map<string, Promise<boolean>>()
    for (const rel of await source.list()) {
      const kind = classify(rel, options.extensionless[i] ?? true)
      if (kind == null) {
        continue
      }
      const head = await source.readHead(rel)
      const info = head == null ? null : parseNativeBinaryHeader(head)
      if (info == null || isNativeBinaryCompatible(info, platform, cpu)) {
        continue
      }

      const declared = platformDeclaredByPath(rel)
      if ((declared.platform != null && declared.platform !== platform) || (declared.cpu != null && declared.cpu !== cpu && declared.cpu !== "universal")) {
        log.debug({ file: rel, detected: describeNativeBinary(info), reason: "path names another platform/arch" }, "skipped native binary check")
        continue
      }
      const root = packageRootOf(rel)
      if (root != null) {
        if (!packageCompatibility.has(root)) {
          packageCompatibility.set(
            root,
            source.readPackageJson(root).then(pkg => pkg == null || isPackageCompatible(pkg, cpu, platform))
          )
        }
        if (!(await packageCompatibility.get(root))) {
          log.debug({ file: rel, detected: describeNativeBinary(info), reason: "package.json os/cpu names another platform/arch" }, "skipped native binary check")
          continue
        }
      }

      mismatches.push({ file: `${source.label}/${rel}`, kind, detected: info })
    }
  }
  return mismatches
}

/** @internal Exported for tests only. */
export function formatMismatch(mismatch: NativeBinaryMismatch, platform: NodeJS.Platform, cpu: string): string {
  const expectedFormat = PLATFORM_FORMAT[platform]
  const expected = expectedFormat == null ? `${platform} ${cpu}` : `${FORMAT_LABEL[expectedFormat]} ${cpu}`
  return `${mismatch.file}: ${describeNativeBinary(mismatch.detected)}, expected ${expected}`
}

export interface VerifyNativeBinariesOptions {
  /** `Contents/Resources` (macOS) or `resources` directory of the packed app. */
  readonly resourcesDir: string
  readonly platform: NodeJS.Platform
  readonly arch: Arch
  /** `nativeModules.verifyNativeBinaries` */
  readonly mode: boolean | "warn" | null | undefined
}

/**
 * Checks that the native binaries shipped in the packed app (`app.asar`, `app.asar.unpacked`, or the `app` directory)
 * match the target platform and arch. A mismatched `.node` addon fails the build (unless `mode` is `"warn"`); any other
 * mismatched native file is a warning, since packages legitimately bundle helper binaries for several platforms.
 */
export async function verifyNativeBinaries({ resourcesDir, platform, arch, mode }: VerifyNativeBinariesOptions): Promise<void> {
  if (mode === false) {
    log.debug({ reason: "nativeModules.verifyNativeBinaries is set to false" }, "skipped native binary check")
    return
  }
  const cpu = archToNodeCpu(arch)
  if (cpu == null || PLATFORM_FORMAT[platform] == null) {
    return // e.g. `universal`: each slice is checked before the merge
  }

  const sources: NativeBinarySource[] = []
  const extensionless: boolean[] = []
  const archive = await asarSource(path.join(resourcesDir, "app.asar"), "app.asar")
  if (archive != null) {
    sources.push(archive)
    extensionless.push(false)
  }
  sources.push(directorySource(path.join(resourcesDir, "app.asar.unpacked"), "app.asar.unpacked"), directorySource(path.join(resourcesDir, "app"), "app"))
  extensionless.push(true, true)

  const mismatches = await findNativeBinaryMismatches(sources, platform, cpu, { extensionless })
  if (mismatches.length === 0) {
    return
  }

  const target = `${platform} ${cpu}`
  const fatal = mode === "warn" ? [] : mismatches.filter(it => it.kind === "addon")
  for (const mismatch of mismatches) {
    if (!fatal.includes(mismatch)) {
      log.warn({ file: mismatch.file, detected: describeNativeBinary(mismatch.detected), target }, "native binary does not match the target platform/arch")
    }
  }
  if (fatal.length > 0) {
    throw new Error(
      `Native module(s) built for the wrong platform/architecture were found in the packaged app (target: ${target}):\n` +
        fatal.map(it => `  ${formatMismatch(it, platform, cpu)}`).join("\n") +
        "\nThe app would fail to load them at runtime. This usually means a binary built for another target (often the build host) was left in node_modules " +
        "because the native rebuild was skipped or reused a cached result. Rebuild native dependencies for the target, " +
        'or set `nativeModules.verifyNativeBinaries` to "warn" (or false) to package anyway.'
    )
  }
}
