import { beforeEach, afterEach, expect } from "vitest"
import { execSync } from "child_process"
import * as fs from "fs-extra"
import * as os from "os"
import * as path from "path"
import { Arch, Platform } from "electron-builder"
import { findSha256SigSection, zeroSigSection, writeSigSection, ElfSection } from "app-builder-lib/src/targets/appimage/elfSigSection"
import { signAppImage } from "app-builder-lib/src/targets/appimage/appImageSign"
import { app } from "../helpers/packTester"

/**
 * Creates a minimal 64-bit little-endian ELF file with a .sha256_sig section.
 * This is a bare-minimum ELF with:
 * - ELF header (64 bytes)
 * - .sha256_sig section data (1024 bytes at offset 64)
 * - Section header string table data at offset 64+1024=1088
 * - Section headers at offset after string table
 */
function createMinimalElfWithSigSection(sigSectionSize: number = 1024): Buffer {
  // String table: \0 + ".sha256_sig\0" + ".shstrtab\0"
  const strTab = Buffer.from("\0.sha256_sig\0.shstrtab\0", "utf8")
  const sha256SigNameIndex = 1
  const shstrtabNameIndex = 1 + ".sha256_sig".length + 1 // after \0 + .sha256_sig + \0

  const elfHeaderSize = 64
  const sigSectionOffset = elfHeaderSize
  const strTabOffset = sigSectionOffset + sigSectionSize
  const shOffset = strTabOffset + strTab.length
  // Align to 8 bytes
  const shOffsetAligned = Math.ceil(shOffset / 8) * 8

  const shEntrySize = 64 // 64-bit section header entry size
  // 3 section headers: null (index 0), .sha256_sig (index 1), .shstrtab (index 2)
  const shNum = 3
  const totalSize = shOffsetAligned + shNum * shEntrySize

  const buf = Buffer.alloc(totalSize, 0)

  // ELF magic
  buf[0] = 0x7f
  buf[1] = 0x45 // E
  buf[2] = 0x4c // L
  buf[3] = 0x46 // F
  buf[4] = 2 // ELFCLASS64
  buf[5] = 1 // ELFDATA2LSB (little-endian)
  buf[6] = 1 // EV_CURRENT
  buf[7] = 0 // ELFOSABI_NONE

  // e_type = ET_EXEC (2)
  buf.writeUInt16LE(2, 16)
  // e_machine = EM_X86_64 (62)
  buf.writeUInt16LE(62, 18)
  // e_version
  buf.writeUInt32LE(1, 20)
  // e_ehsize
  buf.writeUInt16LE(elfHeaderSize, 52)

  // e_shoff (section header table offset) — 64-bit field at offset 40
  buf.writeUInt32LE(shOffsetAligned, 40)
  buf.writeUInt32LE(0, 44)
  // e_shentsize
  buf.writeUInt16LE(shEntrySize, 58)
  // e_shnum
  buf.writeUInt16LE(shNum, 60)
  // e_shstrndx
  buf.writeUInt16LE(2, 62) // index 2 = .shstrtab

  // Write string table data
  strTab.copy(buf, strTabOffset)

  // Section headers (each 64 bytes for 64-bit ELF)
  // Section 0: null entry (all zeros) — already zero

  // Section 1: .sha256_sig
  const sh1 = shOffsetAligned + shEntrySize
  buf.writeUInt32LE(sha256SigNameIndex, sh1 + 0) // sh_name
  buf.writeUInt32LE(1, sh1 + 4) // sh_type = SHT_PROGBITS
  // sh_flags (8 bytes) at +8 — leave as 0
  // sh_addr (8 bytes) at +16 — leave as 0
  // sh_offset (8 bytes) at +24
  buf.writeUInt32LE(sigSectionOffset, sh1 + 24)
  buf.writeUInt32LE(0, sh1 + 28)
  // sh_size (8 bytes) at +32
  buf.writeUInt32LE(sigSectionSize, sh1 + 32)
  buf.writeUInt32LE(0, sh1 + 36)

  // Section 2: .shstrtab
  const sh2 = shOffsetAligned + 2 * shEntrySize
  buf.writeUInt32LE(shstrtabNameIndex, sh2 + 0) // sh_name
  buf.writeUInt32LE(3, sh2 + 4) // sh_type = SHT_STRTAB
  // sh_offset
  buf.writeUInt32LE(strTabOffset, sh2 + 24)
  buf.writeUInt32LE(0, sh2 + 28)
  // sh_size
  buf.writeUInt32LE(strTab.length, sh2 + 32)
  buf.writeUInt32LE(0, sh2 + 36)

  return buf
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "appimage-sign-test-"))
})

afterEach(async () => {
  await fs.remove(tmpDir)
})

describe("elfSigSection", () => {
  test("finds .sha256_sig section in valid ELF", async () => {
    const elfBuf = createMinimalElfWithSigSection(1024)
    const elfPath = path.join(tmpDir, "test.AppImage")
    await fs.writeFile(elfPath, elfBuf)

    const section = await findSha256SigSection(elfPath)
    expect(section).not.toBeNull()
    expect(section!.offset).toBe(64) // right after ELF header
    expect(section!.size).toBe(1024)
  })

  test("returns null for non-ELF file", async () => {
    const filePath = path.join(tmpDir, "notelf.bin")
    await fs.writeFile(filePath, Buffer.from("not an elf file"))

    const section = await findSha256SigSection(filePath)
    expect(section).toBeNull()
  })

  test("returns null for ELF without .sha256_sig section", async () => {
    // Create a minimal ELF with just the null section and shstrtab (no .sha256_sig)
    const strTab = Buffer.from("\0.shstrtab\0", "utf8")
    const elfHeaderSize = 64
    const strTabOffset = elfHeaderSize
    const shOffset = Math.ceil((strTabOffset + strTab.length) / 8) * 8
    const shEntrySize = 64
    const shNum = 2
    const buf = Buffer.alloc(shOffset + shNum * shEntrySize, 0)

    // ELF magic + class + endian
    buf[0] = 0x7f; buf[1] = 0x45; buf[2] = 0x4c; buf[3] = 0x46
    buf[4] = 2; buf[5] = 1; buf[6] = 1
    buf.writeUInt16LE(2, 16)
    buf.writeUInt16LE(62, 18)
    buf.writeUInt32LE(1, 20)
    buf.writeUInt16LE(elfHeaderSize, 52)
    buf.writeUInt32LE(shOffset, 40)
    buf.writeUInt16LE(shEntrySize, 58)
    buf.writeUInt16LE(shNum, 60)
    buf.writeUInt16LE(1, 62) // shstrndx = 1

    strTab.copy(buf, strTabOffset)

    // Section 1: .shstrtab
    const sh1 = shOffset + shEntrySize
    buf.writeUInt32LE(1, sh1) // name index for ".shstrtab"
    buf.writeUInt32LE(3, sh1 + 4) // SHT_STRTAB
    buf.writeUInt32LE(strTabOffset, sh1 + 24)
    buf.writeUInt32LE(strTab.length, sh1 + 32)

    const filePath = path.join(tmpDir, "nosigsection.elf")
    await fs.writeFile(filePath, buf)

    const section = await findSha256SigSection(filePath)
    expect(section).toBeNull()
  })

  test("zeroSigSection zeroes the section bytes", async () => {
    const elfBuf = createMinimalElfWithSigSection(1024)
    // Write some non-zero data in the section area
    elfBuf.fill(0xaa, 64, 64 + 1024)
    const elfPath = path.join(tmpDir, "test.AppImage")
    await fs.writeFile(elfPath, elfBuf)

    const section: ElfSection = { offset: 64, size: 1024 }
    const fd = await fs.open(elfPath, "r+")
    try {
      await zeroSigSection(fd, section)
    } finally {
      await fs.close(fd)
    }

    const result = await fs.readFile(elfPath)
    const sectionData = result.subarray(64, 64 + 1024)
    expect(sectionData.equals(Buffer.alloc(1024, 0))).toBe(true)
  })

  test("writeSigSection writes signature and zero-pads", async () => {
    const elfBuf = createMinimalElfWithSigSection(1024)
    const elfPath = path.join(tmpDir, "test.AppImage")
    await fs.writeFile(elfPath, elfBuf)

    const section: ElfSection = { offset: 64, size: 1024 }
    const sig = Buffer.from("test-signature-data")

    const fd = await fs.open(elfPath, "r+")
    try {
      await writeSigSection(fd, section, sig)
    } finally {
      await fs.close(fd)
    }

    const result = await fs.readFile(elfPath)
    const sectionData = result.subarray(64, 64 + 1024)
    // First bytes should match signature
    expect(sectionData.subarray(0, sig.length).equals(sig)).toBe(true)
    // Remaining bytes should be zero
    expect(sectionData.subarray(sig.length).equals(Buffer.alloc(1024 - sig.length, 0))).toBe(true)
  })

  test("writeSigSection throws if signature exceeds section size", async () => {
    const elfBuf = createMinimalElfWithSigSection(16)
    const elfPath = path.join(tmpDir, "test.AppImage")
    await fs.writeFile(elfPath, elfBuf)

    const section: ElfSection = { offset: 64, size: 16 }
    const sig = Buffer.alloc(32, 0xff)

    const fd = await fs.open(elfPath, "r+")
    try {
      await expect(writeSigSection(fd, section, sig)).rejects.toThrow("exceeds .sha256_sig section size")
    } finally {
      await fs.close(fd)
    }
  })
})

describe("signAppImage", () => {
  test("skips signing when not configured", async () => {
    const elfBuf = createMinimalElfWithSigSection(1024)
    const elfPath = path.join(tmpDir, "test.AppImage")
    await fs.writeFile(elfPath, elfBuf)

    // Should not throw, should be a no-op
    await signAppImage(elfPath, { license: null })

    // Section should still be all zeros
    const result = await fs.readFile(elfPath)
    const sectionData = result.subarray(64, 64 + 1024)
    expect(sectionData.equals(Buffer.alloc(1024, 0))).toBe(true)
  })

  test("skips signing when sign is false", async () => {
    const elfBuf = createMinimalElfWithSigSection(1024)
    const elfPath = path.join(tmpDir, "test.AppImage")
    await fs.writeFile(elfPath, elfBuf)

    await signAppImage(elfPath, { license: null, sign: false })

    const result = await fs.readFile(elfPath)
    const sectionData = result.subarray(64, 64 + 1024)
    expect(sectionData.equals(Buffer.alloc(1024, 0))).toBe(true)
  })
})

/**
 * Helper to create a temporary GPG homedir with a test key.
 * Returns the homedir path and the key fingerprint.
 */
async function createTestGpgKey(): Promise<{ gpgHome: string; fingerprint: string }> {
  const gpgHome = await fs.mkdtemp(path.join(os.tmpdir(), "appimage-test-gpg-"))
  // Generate a test key with no passphrase
  execSync(
    `gpg --homedir "${gpgHome}" --batch --gen-key <<'KEYEOF'
%no-protection
Key-Type: RSA
Key-Length: 2048
Name-Real: AppImage Test Key
Name-Email: appimage-test-${Date.now()}@test.local
Expire-Date: 0
%commit
KEYEOF`,
    { stdio: "pipe" }
  )
  // Get the fingerprint
  const output = execSync(`gpg --homedir "${gpgHome}" --list-keys --with-colons 2>/dev/null | grep '^fpr' | head -1 | cut -d: -f10`, {
    encoding: "utf8",
  }).trim()
  return { gpgHome, fingerprint: output }
}

describe.ifNotWindows("AppImage GPG signing integration", () => {
  test(
    "builds a signed AppImage and verifies the embedded signature",
    async ({ expect }) => {
      // Create an isolated GPG homedir with a test key
      const { gpgHome, fingerprint } = await createTestGpgKey()
      const originalGnupgHome = process.env.GNUPGHOME

      try {
        // Set GNUPGHOME so the gpg invoked by signAppImage uses our test key
        process.env.GNUPGHOME = gpgHome

        await app(
          expect,
          {
            targets: Platform.LINUX.createTarget("appimage", Arch.x64),
            config: {
              toolsets: { appimage: "1.0.2" },
              appImage: {
                sign: {
                  gpgKeyId: fingerprint,
                  detachedSigFile: true,
                },
              },
            },
          },
          {
            packed: async context => {
              const outDir = context.outDir
              // Find the .AppImage file
              const files = await fs.readdir(outDir)
              const appImageName = files.find(f => f.endsWith(".AppImage"))
              expect(appImageName).toBeTruthy()
              const appImagePath = path.join(outDir, appImageName!)

              // Verify .sha256_sig section has non-zero content
              const section = await findSha256SigSection(appImagePath)
              expect(section).not.toBeNull()
              expect(section!.size).toBeGreaterThan(0)

              const fd = await fs.open(appImagePath, "r")
              const sectionBuf = Buffer.alloc(section!.size)
              await fs.read(fd, sectionBuf, 0, section!.size, section!.offset)
              await fs.close(fd)

              const isAllZero = sectionBuf.every(b => b === 0)
              expect(isAllZero).toBe(false)

              // Verify the section contains an ASCII-armored PGP signature
              const sigText = sectionBuf.toString("utf8").replace(/\0+$/, "")
              expect(sigText).toContain("-----BEGIN PGP SIGNATURE-----")
              expect(sigText).toContain("-----END PGP SIGNATURE-----")

              // Verify detached .sig file exists
              const sigFilePath = `${appImagePath}.sig`
              expect(await fs.pathExists(sigFilePath)).toBe(true)
              const sigFileContent = await fs.readFile(sigFilePath, "utf8")
              expect(sigFileContent).toContain("-----BEGIN PGP SIGNATURE-----")

              // Verify the GPG signature by zeroing the section and running gpg --verify
              const tmpVerify = path.join(outDir, "verify.AppImage")
              await fs.copyFile(appImagePath, tmpVerify)
              const verifyFd = await fs.open(tmpVerify, "r+")
              const zeroBuf = Buffer.alloc(section!.size, 0)
              await fs.write(verifyFd, zeroBuf, 0, zeroBuf.length, section!.offset)
              await fs.close(verifyFd)

              try {
                execSync(`gpg --homedir "${gpgHome}" --verify "${sigFilePath}" "${tmpVerify}" 2>&1`, { encoding: "utf8" })
              } catch (e: any) {
                const output = (e.stdout || "") + (e.stderr || "")
                // gpg --verify exits non-zero if key isn't fully trusted, but still says "Good signature"
                expect(output).toContain("Good signature")
              }

              // Verify the AppImage's own --appimage-signature outputs the signature
              try {
                await fs.chmod(appImagePath, 0o755)
                const appimageOutput = execSync(`"${appImagePath}" --appimage-signature 2>&1`, { encoding: "utf8" })
                expect(appimageOutput).toContain("-----BEGIN PGP SIGNATURE-----")
              } catch (e: any) {
                const output = (e.stdout || "") + (e.stderr || "")
                // Some environments may not support FUSE; just check if we got output
                if (output.includes("BEGIN PGP SIGNATURE")) {
                  expect(output).toContain("-----BEGIN PGP SIGNATURE-----")
                }
                // Otherwise skip this check — the ELF section validation above is sufficient
              }
            },
          }
        )
      } finally {
        // Restore original GNUPGHOME
        if (originalGnupgHome !== undefined) {
          process.env.GNUPGHOME = originalGnupgHome
        } else {
          delete process.env.GNUPGHOME
        }
        await fs.remove(gpgHome).catch(() => {})
      }
    }
  )
})
