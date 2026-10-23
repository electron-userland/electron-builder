import { Arch, TmpDir } from "builder-util"
import {
  directorySource,
  findNativeBinaryMismatches,
  isNativeBinaryCompatible,
  parseNativeBinaryHeader,
  platformDeclaredByPath,
  verifyNativeBinaries,
} from "app-builder-lib/src/util/nativeBinaryVerifier.js"
import fse from "fs-extra"
import * as path from "path"
import { afterAll, describe, test } from "vitest"

// Synthetic headers: only the bytes the parser reads, never real binaries.

const ELF_MACHINE = { ia32: 3, arm: 40, x64: 62, arm64: 183 } as const
function elf(machine: number, bigEndian = false): Buffer {
  const buf = Buffer.alloc(64)
  buf.write("\x7fELF", 0, "latin1")
  buf[4] = 2 // ELFCLASS64
  buf[5] = bigEndian ? 2 : 1 // EI_DATA
  if (bigEndian) {
    buf.writeUInt16BE(machine, 18)
  } else {
    buf.writeUInt16LE(machine, 18)
  }
  return buf
}

const MACHO_CPU = { ia32: 7, x64: 0x01000007, arm: 12, arm64: 0x0100000c } as const
function macho(cpuType: number): Buffer {
  const buf = Buffer.alloc(32)
  buf.writeUInt32LE(0xfeedfacf, 0) // on disk: cf fa ed fe (64-bit, little-endian)
  buf.writeUInt32LE(cpuType, 4)
  buf.writeUInt32LE(8, 12) // MH_BUNDLE
  return buf
}
function machoFat(cpuTypes: number[]): Buffer {
  const buf = Buffer.alloc(8 + cpuTypes.length * 20)
  buf.writeUInt32BE(0xcafebabe, 0)
  buf.writeUInt32BE(cpuTypes.length, 4)
  cpuTypes.forEach((cpu, i) => buf.writeUInt32BE(cpu, 8 + i * 20))
  return buf
}

const PE_MACHINE = { ia32: 0x14c, x64: 0x8664, arm: 0x1c4, arm64: 0xaa64 } as const
function pe(machine: number, peOffset = 0x80): Buffer {
  const buf = Buffer.alloc(peOffset + 24)
  buf.write("MZ", 0, "latin1")
  buf.writeUInt32LE(peOffset, 0x3c)
  buf.write("PE\0\0", peOffset, "latin1")
  buf.writeUInt16LE(machine, peOffset + 4)
  return buf
}

/** A minimal asar archive (pickled JSON header + concatenated file contents). */
function asar(files: Record<string, Buffer>): Buffer {
  const header: any = { files: {} }
  const contents: Buffer[] = []
  let offset = 0
  for (const [rel, data] of Object.entries(files)) {
    const parts = rel.split("/")
    let dir = header
    for (const part of parts.slice(0, -1)) {
      dir = dir.files[part] ??= { files: {} }
    }
    dir.files[parts[parts.length - 1]] = { size: data.length, offset: String(offset) }
    offset += data.length
    contents.push(data)
  }
  const json = Buffer.from(JSON.stringify(header))
  const padded = Math.ceil(json.length / 4) * 4
  const headerPickle = Buffer.alloc(8 + padded)
  headerPickle.writeUInt32LE(4 + padded, 0)
  headerPickle.writeInt32LE(json.length, 4)
  json.copy(headerPickle, 8)
  const sizePickle = Buffer.alloc(8)
  sizePickle.writeUInt32LE(4, 0)
  sizePickle.writeUInt32LE(headerPickle.length, 4)
  return Buffer.concat([sizePickle, headerPickle, ...contents])
}

const tmpDir = new TmpDir("native-binary-verifier-test")
afterAll(() => tmpDir.cleanup())

async function tree(files: Record<string, Buffer | object>): Promise<string> {
  const root = await tmpDir.createTempDir()
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel)
    await fse.ensureDir(path.dirname(file))
    await fse.writeFile(file, Buffer.isBuffer(content) ? content : JSON.stringify(content))
  }
  return root
}

describe("parseNativeBinaryHeader", () => {
  test("ELF e_machine", ({ expect }) => {
    for (const [cpu, machine] of Object.entries(ELF_MACHINE)) {
      expect(parseNativeBinaryHeader(elf(machine))).toEqual({ format: "elf", arches: [cpu] })
    }
    expect(parseNativeBinaryHeader(elf(ELF_MACHINE.arm64, true))).toEqual({ format: "elf", arches: ["arm64"] })
    expect(parseNativeBinaryHeader(elf(243))).toEqual({ format: "elf", arches: ["unknown(0xf3)"] }) // RISC-V
  })

  test("Mach-O thin and fat cputype", ({ expect }) => {
    for (const [cpu, type] of Object.entries(MACHO_CPU)) {
      expect(parseNativeBinaryHeader(macho(type))).toEqual({ format: "macho", arches: [cpu] })
    }
    const bigEndian = Buffer.alloc(32)
    bigEndian.writeUInt32BE(0xfeedface, 0)
    bigEndian.writeUInt32BE(MACHO_CPU.x64, 4)
    expect(parseNativeBinaryHeader(bigEndian)).toEqual({ format: "macho", arches: ["x64"] })
    expect(parseNativeBinaryHeader(machoFat([MACHO_CPU.x64, MACHO_CPU.arm64]))).toEqual({ format: "macho", arches: ["x64", "arm64"] })
  })

  test("a Java class file (same 0xcafebabe magic) is not a fat Mach-O", ({ expect }) => {
    const javaClass = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34, 0, 0, 0, 0])
    expect(parseNativeBinaryHeader(javaClass)).toBeNull()
  })

  test("PE Machine", ({ expect }) => {
    for (const [cpu, machine] of Object.entries(PE_MACHINE)) {
      expect(parseNativeBinaryHeader(pe(machine))).toEqual({ format: "pe", arches: [cpu] })
    }
    expect(parseNativeBinaryHeader(pe(PE_MACHINE.x64, 0x200))).toEqual({ format: "pe", arches: ["x64"] })
  })

  test("non-binary and truncated input", ({ expect }) => {
    expect(parseNativeBinaryHeader(Buffer.from("module.exports = 1\n"))).toBeNull()
    expect(parseNativeBinaryHeader(Buffer.from("MZ is a text file that starts like a PE"))).toBeNull()
    expect(parseNativeBinaryHeader(elf(ELF_MACHINE.x64).subarray(0, 10))).toBeNull()
    expect(parseNativeBinaryHeader(machoFat([MACHO_CPU.x64, MACHO_CPU.arm64]).subarray(0, 20))).toBeNull()
    expect(parseNativeBinaryHeader(Buffer.alloc(0))).toBeNull()
  })
})

describe("isNativeBinaryCompatible", () => {
  test("format must match the platform and the arch must be present", ({ expect }) => {
    expect(isNativeBinaryCompatible({ format: "elf", arches: ["x64"] }, "linux", "x64")).toBe(true)
    expect(isNativeBinaryCompatible({ format: "elf", arches: ["x64"] }, "linux", "arm64")).toBe(false)
    expect(isNativeBinaryCompatible({ format: "elf", arches: ["x64"] }, "darwin", "x64")).toBe(false)
    expect(isNativeBinaryCompatible({ format: "macho", arches: ["x64", "arm64"] }, "darwin", "arm64")).toBe(true)
    expect(isNativeBinaryCompatible({ format: "macho", arches: ["x64"] }, "darwin", "arm64")).toBe(false)
    expect(isNativeBinaryCompatible({ format: "pe", arches: ["arm64"] }, "win32", "arm64")).toBe(true)
    expect(isNativeBinaryCompatible({ format: "pe", arches: ["x64"] }, "win32", "arm64")).toBe(false)
  })
})

describe("platformDeclaredByPath", () => {
  test("recognizes prebuild and platform-package layouts", ({ expect }) => {
    expect(platformDeclaredByPath("node_modules/foo/prebuilds/linux-arm64/foo.node")).toEqual({ platform: "linux", cpu: "arm64" })
    expect(platformDeclaredByPath("node_modules/foo/prebuilds/darwin-x64+arm64/foo.node")).toEqual({ platform: "darwin", cpu: "universal" })
    expect(platformDeclaredByPath("node_modules/foo/lib/binding/napi-v6-linux-glibc-x86_64/foo.node")).toEqual({ platform: "linux", cpu: "x64" })
    expect(platformDeclaredByPath("node_modules/@img/sharp-win32-ia32/lib/sharp.node")).toEqual({ platform: "win32", cpu: "ia32" })
    expect(platformDeclaredByPath("node_modules/7zip-bin/win/arm64/7za.exe")).toEqual({ platform: "win32", cpu: "arm64" })
  })

  test("ignores package names that merely mention a platform, and the file name", ({ expect }) => {
    expect(platformDeclaredByPath("node_modules/node-mac-permissions/build/Release/permissions.node")).toEqual({})
    expect(platformDeclaredByPath("node_modules/foo/build/Release/foo-linux-x64.node")).toEqual({})
  })
})

describe("findNativeBinaryMismatches", () => {
  test("reports wrong-platform/arch binaries and skips variants declared for another target", async ({ expect }) => {
    const root = await tree({
      "node_modules/good/build/Release/good.node": elf(ELF_MACHINE.x64),
      "node_modules/stale/build/Release/stale.node": macho(MACHO_CPU.arm64),
      "node_modules/wrong-arch/build/Release/wrong.node": elf(ELF_MACHINE.arm64),
      // prebuildify ships every platform; node-gyp-build only loads the matching one
      "node_modules/multi/prebuilds/darwin-arm64/multi.node": macho(MACHO_CPU.arm64),
      "node_modules/multi/prebuilds/win32-x64/multi.node": pe(PE_MACHINE.x64),
      "node_modules/multi/prebuilds/linux-x64/multi.node": elf(ELF_MACHINE.x64),
      // platform package kept in both slices of a universal build (arch filter disabled)
      "node_modules/@scope/native-binding/package.json": { name: "@scope/native-binding", os: ["linux"], cpu: ["arm64"] },
      "node_modules/@scope/native-binding/binding.node": elf(ELF_MACHINE.arm64),
      "node_modules/tool/bin/tool": elf(ELF_MACHINE.arm64),
      "node_modules/tool/README": Buffer.from("not a binary"),
      "node_modules/lib/libfoo.so.1.2": pe(PE_MACHINE.x64),
      "main.js": Buffer.from("require('good')"),
    })
    const mismatches = await findNativeBinaryMismatches([directorySource(root, "app")], "linux", "x64")
    expect(mismatches.map(it => [it.file, it.kind]).sort()).toEqual([
      ["app/node_modules/lib/libfoo.so.1.2", "library"],
      ["app/node_modules/stale/build/Release/stale.node", "addon"],
      ["app/node_modules/tool/bin/tool", "library"],
      ["app/node_modules/wrong-arch/build/Release/wrong.node", "addon"],
    ])
  })
})

describe("verifyNativeBinaries", () => {
  const linuxX64 = { platform: "linux" as const, arch: Arch.x64 }

  test("fails the build on a mismatched .node addon, naming the file, detected and expected target", async ({ expect }) => {
    const resourcesDir = await tree({ "app.asar.unpacked/node_modules/sqlite/build/Release/sqlite.node": macho(MACHO_CPU.arm64) })
    await expect(verifyNativeBinaries({ resourcesDir, ...linuxX64, mode: undefined })).rejects.toThrow(
      "app.asar.unpacked/node_modules/sqlite/build/Release/sqlite.node: Mach-O arm64, expected ELF x64"
    )
    await expect(verifyNativeBinaries({ resourcesDir, ...linuxX64, mode: true })).rejects.toThrow("target: linux x64")
  })

  test("checks .node addons packed inside app.asar", async ({ expect }) => {
    const resourcesDir = await tree({
      "app.asar": asar({
        "package.json": Buffer.from("{}"),
        "node_modules/ok/ok.node": elf(ELF_MACHINE.x64),
        "node_modules/bad/bad.node": pe(PE_MACHINE.x64),
      }),
    })
    await expect(verifyNativeBinaries({ resourcesDir, ...linuxX64, mode: undefined })).rejects.toThrow(
      /app\.asar\/node_modules\/bad\/bad\.node: PE x64, expected ELF x64(?![\s\S]*ok\.node)/
    )
  })

  test('"warn" and false never fail; matching binaries and non-addon mismatches pass', async ({ expect }) => {
    const stale = await tree({ "app/node_modules/x/x.node": elf(ELF_MACHINE.arm64) })
    await expect(verifyNativeBinaries({ resourcesDir: stale, ...linuxX64, mode: "warn" })).resolves.toBeUndefined()
    await expect(verifyNativeBinaries({ resourcesDir: stale, ...linuxX64, mode: false })).resolves.toBeUndefined()

    const ok = await tree({
      "app/node_modules/x/x.node": machoFat([MACHO_CPU.x64, MACHO_CPU.arm64]),
      "app/node_modules/esbuild/bin/esbuild": elf(ELF_MACHINE.x64), // host tool: warning only
    })
    await expect(verifyNativeBinaries({ resourcesDir: ok, platform: "darwin", arch: Arch.arm64, mode: undefined })).resolves.toBeUndefined()
  })

  test("universal is not checked directly (each slice is verified before the merge)", async ({ expect }) => {
    const resourcesDir = await tree({ "app/node_modules/x/x.node": elf(ELF_MACHINE.x64) })
    await expect(verifyNativeBinaries({ resourcesDir, platform: "darwin", arch: Arch.universal, mode: undefined })).resolves.toBeUndefined()
  })
})
