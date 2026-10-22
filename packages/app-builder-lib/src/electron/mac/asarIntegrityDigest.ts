import { exec, InvalidConfigurationError, log, sanitizeDirPath } from "builder-util"
import { createHash } from "crypto"
import { FileHandle, open } from "fs/promises"
import * as path from "path"
import { AsarIntegrity } from "../../asar/integrity.js"
import { parsePlistFile } from "../../util/mac/plist.js"

/**
 * Marks the slot Electron (>= 41) reserves in the `Electron Framework` binary for the digest of the
 * `ElectronAsarIntegrity` Info.plist dictionary. The sentinel is followed by `used` (1 byte), `version` (1 byte) and
 * the SHA-256 digest (32 bytes); Electron skips the check (fails open) while `used` is 0.
 * @see https://github.com/electron/electron/blob/main/shell/common/asar/integrity_digest.mm
 */
export const ASAR_INTEGRITY_DIGEST_SENTINEL = "AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A"

/** electron/electron#48587, first released in 41.0.0-alpha.1 and not backported. */
export const FIRST_ELECTRON_MAJOR_WITH_ASAR_INTEGRITY_DIGEST = 41

const DIGEST_VERSION = 1
const DIGEST_LENGTH = 32
// used + version + digest
const SLOT_LENGTH = 2 + DIGEST_LENGTH
const SCAN_CHUNK_SIZE = 4 * 1024 * 1024

/**
 * Computes the version 1 digest Electron validates the `ElectronAsarIntegrity` dictionary against: SHA-256 over the
 * UTF-8 key, algorithm and hash of every entry, in key order.
 * @internal
 */
export function computeAsarIntegrityDigest(integrity: AsarIntegrity): Buffer {
  const hash = createHash("sha256")
  // Electron sorts the keys with NSLiteralSearch (UTF-16 code unit order), which is what the default sort() does; localeCompare would not match
  for (const key of Object.keys(integrity).sort()) {
    const { algorithm, hash: headerHash } = integrity[key]
    hash.update(key).update(algorithm).update(headerHash)
  }
  return hash.digest()
}

/**
 * Writes `digest` into every digest slot of an `Electron Framework` binary (one per architecture slice) and returns how
 * many slots were written, 0 if the binary has none (Electron < 41). The slots are counted and bounds-checked before the
 * first write, so a failure never leaves one slice of a universal binary enforcing a digest the other lacks.
 * @internal
 */
export async function writeAsarIntegrityDigest(binaryPath: string, digest: Buffer): Promise<number> {
  if (digest.length !== DIGEST_LENGTH) {
    throw new Error(`ASAR integrity digest must be ${DIGEST_LENGTH} bytes, got ${digest.length}`)
  }

  const sentinel = Buffer.from(ASAR_INTEGRITY_DIGEST_SENTINEL)
  const handle = await open(binaryPath, "r+")
  try {
    const { size } = await handle.stat()
    const slotOffsets = (await findSentinels(handle, size, sentinel)).map(it => it + sentinel.length)
    if (slotOffsets.length > 2) {
      throw new Error(`Found ${slotOffsets.length} ASAR integrity digest slots in ${binaryPath}, at most 2 are expected (one per slice of a universal binary)`)
    }
    for (const offset of slotOffsets) {
      if (offset + SLOT_LENGTH > size) {
        throw new Error(`ASAR integrity digest slot at offset ${offset} of ${binaryPath} is truncated, the binary is corrupted or not an Electron Framework`)
      }
    }

    const payload = Buffer.alloc(SLOT_LENGTH)
    payload[0] = 1 // used
    payload[1] = DIGEST_VERSION
    digest.copy(payload, 2)
    for (const offset of slotOffsets) {
      await handle.write(payload, 0, payload.length, offset)
    }
    return slotOffsets.length
  } finally {
    await handle.close()
  }
}

/**
 * Embeds the digest of the app's `ElectronAsarIntegrity` Info.plist entries into its Electron Framework, then signs the
 * framework again, ad hoc: the write invalidates its signature (Electron's arm64 builds ship linker-signed), and Apple
 * Silicon refuses to load a binary whose signature is invalid. Code signing the app afterwards replaces the ad-hoc
 * signature. macOS only (codesign). Returns whether the digest was embedded.
 * @internal
 */
export async function embedAsarIntegrityDigest(appPath: string, frameworkName: string): Promise<boolean> {
  const safeAppPath = sanitizeDirPath(appPath)
  const infoPlistPath = path.join(safeAppPath, "Contents", "Info.plist")
  const integrity = await readAsarIntegrity(infoPlistPath)
  if (integrity == null || Object.keys(integrity).length === 0) {
    log.warn({ file: log.filePath(infoPlistPath), reason: "Info.plist has no ElectronAsarIntegrity entries" }, "skipped ASAR integrity digest")
    return false
  }

  // frameworkName is a file name, not a path: resolving it on its own would root it at the cwd. Containment keeps both paths inside the app
  const frameworksDir = path.join(safeAppPath, "Contents", "Frameworks")
  const frameworkPath = sanitizeDirPath(path.join(frameworksDir, `${frameworkName}.framework`), frameworksDir)
  const binaryPath = sanitizeDirPath(path.join(frameworkPath, frameworkName), frameworkPath)
  if ((await writeAsarIntegrityDigest(binaryPath, computeAsarIntegrityDigest(integrity))) === 0) {
    log.warn({ file: log.filePath(binaryPath), reason: "the binary has no ASAR integrity digest slot" }, "skipped ASAR integrity digest")
    return false
  }

  // --deep: Electron's x64 builds ship the framework's nested code unsigned, and codesign refuses to seal a bundle around unsigned code
  // Copied/verified from electron/packager:
  // https://github.com/electron/packager/blob/8c5cc941018b1d890c7152734972c44b9b98f268/src/mac.ts#L704-L733
  await exec("/usr/bin/codesign", ["--sign", "-", "--force", "--deep", "--preserve-metadata=entitlements,requirements,flags,runtime", frameworkPath])
  log.info({ file: log.filePath(frameworkPath) }, "embedded ASAR integrity digest")
  return true
}

// parsePlistFile reads the XML format electron-builder writes; an afterPack hook that edits Info.plist with `defaults write` leaves it binary
async function readAsarIntegrity(infoPlistPath: string): Promise<AsarIntegrity | undefined> {
  try {
    return (await parsePlistFile<{ ElectronAsarIntegrity?: AsarIntegrity }>(infoPlistPath)).ElectronAsarIntegrity
  } catch (e: any) {
    throw new InvalidConfigurationError(
      `Cannot read ${infoPlistPath} to embed the ASAR integrity digest: ${e.message}. Keep Info.plist in the XML format electron-builder writes (\`defaults write\` converts it to binary, PlistBuddy and \`plutil -replace\` keep it XML), or set mac.asarIntegrityDigest to false`
    )
  }
}

async function findSentinels(handle: FileHandle, size: number, sentinel: Buffer): Promise<Array<number>> {
  // each read overlaps the next chunk by sentinel.length - 1 bytes, so a sentinel straddling a chunk boundary is found (once)
  const buffer = Buffer.allocUnsafe(SCAN_CHUNK_SIZE + sentinel.length - 1)
  const offsets: Array<number> = []
  for (let start = 0; start < size; start += SCAN_CHUNK_SIZE) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - start), start)
    const chunk = buffer.subarray(0, bytesRead)
    for (let index = chunk.indexOf(sentinel); index !== -1; index = chunk.indexOf(sentinel, index + 1)) {
      offsets.push(start + index)
    }
  }
  return offsets
}
