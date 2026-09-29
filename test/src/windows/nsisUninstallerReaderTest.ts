import { UninstallerReader, verifyNsisIntegrity } from "app-builder-lib/src/targets/win/nsis/nsisUtil"
import { getMakeNsisPath } from "app-builder-lib/src/toolsets/nsis"
import { exec, exists, spawnAndWriteWithOutput } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"

// UninstallerReader extracts the uninstaller from an installer built with `WriteUninstaller`, without running it.
// It must produce the same bytes as NSIS itself, including the uninstaller icon patch, or the uninstaller fails
// its own CRC check ("Installer integrity check has failed") on the end user's machine.

async function buildInstaller(tmpDir: TmpDir, uninstallerIcon: string, compress = true) {
  const dir = await tmpDir.getTempDir({ prefix: "nsis-uninstaller-reader" })
  await fs.mkdir(dir, { recursive: true })
  const makensis = await getMakeNsisPath(undefined, dir)
  const installer = path.join(dir, "installer.exe")
  const script = [
    "Unicode true",
    compress ? "SetCompressor zlib" : "SetCompress off",
    `OutFile "${installer}"`,
    'Icon "${NSISDIR}/Contrib/Graphics/Icons/modern-install.ico"',
    `UninstallIcon "\${NSISDIR}/Contrib/Graphics/Icons/${uninstallerIcon}"`,
    "RequestExecutionLevel user",
    "SilentInstall silent",
    'Section "install"',
    '  WriteUninstaller "$EXEDIR\\uninstaller.exe"',
    "SectionEnd",
    'Section "Uninstall"',
    '  DetailPrint "uninstall"',
    "SectionEnd",
  ].join("\n")
  await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], script, { env: { ...process.env, ...makensis.env } })
  // the bundle entrypoint sets NSISDIR to its "windows" directory
  const iconsDir = path.join(path.dirname(makensis.path), "windows", "Contrib", "Graphics", "Icons")
  return { dir, installer, uninstaller: path.join(dir, "uninstaller.exe"), iconsDir }
}

async function readIconImages(file: string): Promise<Array<Buffer>> {
  const data = await fs.readFile(file)
  const images: Array<Buffer> = []
  // ICONDIR (6 bytes) followed by 16-byte ICONDIRENTRY records with the image size and offset at +8 and +12
  for (let i = 0; i < data.readUInt16LE(4); i++) {
    const entry = 6 + i * 16
    const offset = data.readUInt32LE(entry + 12)
    images.push(data.subarray(offset, offset + data.readUInt32LE(entry + 8)))
  }
  return images
}

for (const compress of [true, false]) {
  describe(`UninstallerReader (${compress ? "zlib" : "no compression"})`, () => {
    test("uninstaller icon differs from installer icon", async ({ expect, tmpDir }) => {
      const { installer, uninstaller, iconsDir } = await buildInstaller(tmpDir, "modern-uninstall.ico", compress)
      await UninstallerReader.exec(installer, uninstaller)

      const data = await fs.readFile(uninstaller)
      expect(() => verifyNsisIntegrity(data)).not.toThrow()
      // the uninstaller icon images are patched into the exehead copied from the installer
      for (const image of await readIconImages(path.join(iconsDir, "modern-uninstall.ico"))) {
        expect(data.includes(image)).toBe(true)
      }
    })

    test("uninstaller icon is the installer icon", async ({ expect, tmpDir }) => {
      const { installer, uninstaller } = await buildInstaller(tmpDir, "modern-install.ico", compress)
      await UninstallerReader.exec(installer, uninstaller)
      const data = await fs.readFile(uninstaller)
      expect(() => verifyNsisIntegrity(data)).not.toThrow()
    })
  })
}

test("fails instead of writing an uninstaller that does not pass the NSIS integrity check", async ({ expect, tmpDir }) => {
  const { dir, installer, uninstaller } = await buildInstaller(tmpDir, "modern-uninstall.ico")
  // simulate drift between the installer's exehead and the one makensis computed the uninstaller CRC for
  const data = await fs.readFile(installer)
  data[2048] ^= 0xff
  const corrupted = path.join(dir, "corrupted.exe")
  await fs.writeFile(corrupted, data)

  await expect(UninstallerReader.exec(corrupted, uninstaller)).rejects.toThrow(/NSIS integrity check failed: CRC32/)
  expect(await exists(uninstaller)).toBe(false)
})

describe("verifyNsisIntegrity", () => {
  test("rejects data without an NSIS header", ({ expect }) => {
    expect(() => verifyNsisIntegrity(Buffer.alloc(4096))).toThrow(/NSIS header not found/)
  })

  test("checks the installer itself", async ({ expect, tmpDir }) => {
    const { installer } = await buildInstaller(tmpDir, "modern-uninstall.ico")
    const data = await fs.readFile(installer)
    expect(() => verifyNsisIntegrity(data)).not.toThrow()
    // data appended after the CRC (e.g. an Authenticode signature) is not covered
    expect(() => verifyNsisIntegrity(Buffer.concat([data, Buffer.alloc(100)]))).not.toThrow()
    expect(() => verifyNsisIntegrity(data.subarray(0, data.length - 1))).toThrow(/data length mismatch/)
    const corrupted = Buffer.from(data)
    corrupted[corrupted.length - 10] ^= 0xff
    expect(() => verifyNsisIntegrity(corrupted)).toThrow(/CRC32/)
  })
})

test.ifWindows("extracted uninstaller runs", async ({ expect, tmpDir }) => {
  const { dir, installer, uninstaller } = await buildInstaller(tmpDir, "modern-uninstall.ico")
  await UninstallerReader.exec(installer, uninstaller)
  // exits with code 2 if the integrity check fails; `_?=` runs it in place instead of from a temp copy
  await expect(exec(uninstaller, ["/S", `_?=${dir}`])).resolves.toBeDefined()
})
