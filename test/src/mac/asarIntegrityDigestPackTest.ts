import { parsePlistFile, PlistObject } from "app-builder-lib/internal"
import { ASAR_INTEGRITY_DIGEST_SENTINEL } from "app-builder-lib/src/electron/mac/asarIntegrityDigest"
import { savePlistFile } from "app-builder-lib/src/util/mac/plist"
import { exec } from "builder-util"
import { execFile } from "child_process"
import { createHash } from "crypto"
import { Arch, Configuration, DIR_TARGET, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { app, PackedContext } from "../helpers/packTester"
import { ASAR_INTEGRITY_DIGEST_ELECTRON_VERSION } from "../helpers/testConfig"

const SENTINEL = Buffer.from(ASAR_INTEGRITY_DIGEST_SENTINEL)
const STARTED = "ASAR_INTEGRITY_DIGEST_TEST_APP_STARTED"
// An Info.plist entry for an archive the app never opens: Electron still checks it, through the digest. "U" sorts before
// "a" by code unit but after it by locale, so a digest in the wrong key order would fail the launch as well.
const UNOPENED_ASAR = "Resources/Unopened.asar"
const arch = process.arch === "arm64" ? Arch.arm64 : Arch.x64

const config: Configuration = {
  electronVersion: ASAR_INTEGRITY_DIGEST_ELECTRON_VERSION,
  // the app is not code signed, so the fuse flip has to restore the ad-hoc signature it invalidates
  electronFuses: { enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true, resetAdHocDarwinSignature: true },
  // the digest must cover the final Info.plist, as left by the afterPack hook
  afterPack: ({ appOutDir, packager }) => setIntegrityEntry(path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents"), "0".repeat(64)),
}

// Electron validates app.asar when it loads the main script from it, so this can quit right away
async function writeMainScript(projectDir: string): Promise<void> {
  const file = path.join(projectDir, "index.js")
  // because copied as hard link
  await fs.unlink(file)
  await fs.writeFile(file, `console.log(${JSON.stringify(STARTED)})\nprocess.exit(0)\n`)
}

async function setIntegrityEntry(contents: string, hash: string): Promise<void> {
  const infoPlist = path.join(contents, "Info.plist")
  const plist = await parsePlistFile<PlistObject>(infoPlist)
  ;(plist.ElectronAsarIntegrity as PlistObject)[UNOPENED_ASAR] = { algorithm: "SHA256", hash }
  await savePlistFile(infoPlist, plist)
}

// What an attacker who can write to the app does: change an ElectronAsarIntegrity entry and sign the app again, ad hoc.
async function tamper(contents: string): Promise<void> {
  await setIntegrityEntry(contents, "1".repeat(64))
  await exec("/usr/bin/codesign", ["--sign", "-", "--force", "--deep", path.dirname(contents)])
}

async function readSlots(contents: string) {
  const binary = await fs.readFile(path.join(contents, "Frameworks", "Electron Framework.framework", "Versions", "A", "Electron Framework"))
  const slots: Array<{ used: number; version: number; digest: string }> = []
  for (let index = binary.indexOf(SENTINEL); index !== -1; index = binary.indexOf(SENTINEL, index + 1)) {
    const slot = index + SENTINEL.length
    slots.push({ used: binary[slot], version: binary[slot + 1], digest: binary.subarray(slot + 2, slot + 34).toString("hex") })
  }
  return slots
}

// SHA-256 over the key, algorithm and hash of every Info.plist entry, keys in UTF-16 code unit order (Electron's NSLiteralSearch)
async function expectedDigest(contents: string): Promise<string> {
  const integrity = (await parsePlistFile<PlistObject>(path.join(contents, "Info.plist"))).ElectronAsarIntegrity as Record<string, { algorithm: string; hash: string }>
  const hash = createHash("sha256")
  for (const key of Object.keys(integrity).sort()) {
    hash.update(key + integrity[key].algorithm + integrity[key].hash)
  }
  return hash.digest("hex")
}

function launch(context: PackedContext, contents: string): Promise<{ code: number | string | null; stdout: string; stderr: string }> {
  // set when the tests run from an Electron-based editor, and would make the app run as plain Node.js
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env
  const executable = path.join(contents, "MacOS", context.packager.appInfo.productFilename)
  return new Promise(resolve => {
    execFile(executable, { env, timeout: 60_000 }, (error, stdout, stderr) => resolve({ code: error == null ? 0 : (error.code ?? error.signal ?? null), stdout, stderr }))
  })
}

describe.ifMac("ASAR integrity digest", { concurrent: false }, () => {
  test("is embedded into the Electron Framework and enforced by Electron", ({ expect }) =>
    app(
      expect,
      { targets: Platform.MAC.createTarget(DIR_TARGET, arch), config },
      {
        projectDirCreated: writeMainScript,
        packed: async context => {
          const contents = context.getContent(Platform.MAC, arch)
          expect(await readSlots(contents)).toEqual([{ used: 1, version: 1, digest: await expectedDigest(contents) }])
          // the fuse flip signed the whole app again after the digest was written
          await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", path.dirname(contents)])

          expect(await launch(context, contents)).toMatchObject({ code: 0, stdout: expect.stringContaining(STARTED) })

          await tamper(contents)
          const tampered = await launch(context, contents)
          expect(tampered.code).not.toBe(0)
          expect(tampered.stdout).not.toContain(STARTED)
          expect(tampered.stderr).toContain("Failed to get integrity for validatable asar archive")
        },
      }
    ))

  // nothing signs the app afterwards: Apple Silicon would kill it on launch if the patched framework were not signed again
  test("leaves an unsigned app launchable", ({ expect }) =>
    app(
      expect,
      { targets: Platform.MAC.createTarget(DIR_TARGET, arch), config: { electronVersion: ASAR_INTEGRITY_DIGEST_ELECTRON_VERSION } },
      {
        projectDirCreated: writeMainScript,
        packed: async context => {
          const contents = context.getContent(Platform.MAC, arch)
          expect(await readSlots(contents)).toEqual([{ used: 1, version: 1, digest: await expectedDigest(contents) }])
          await exec("/usr/bin/codesign", ["--verify", "--strict", path.join(contents, "Frameworks", "Electron Framework.framework")])
          expect(await launch(context, contents)).toMatchObject({ code: 0, stdout: expect.stringContaining(STARTED) })
        },
      }
    ))

  test("is not embedded with asarIntegrityDigest set to false, and a changed Info.plist entry goes unnoticed", ({ expect }) =>
    app(
      expect,
      { targets: Platform.MAC.createTarget(DIR_TARGET, arch), config: { ...config, mac: { asarIntegrityDigest: false } } },
      {
        projectDirCreated: writeMainScript,
        packed: async context => {
          const contents = context.getContent(Platform.MAC, arch)
          expect((await readSlots(contents)).map(it => it.used)).toEqual([0])

          await tamper(contents)
          expect(await launch(context, contents)).toMatchObject({ code: 0, stdout: expect.stringContaining(STARTED) })
        },
      }
    ))
})
