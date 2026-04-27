import { exec, log } from "builder-util"
import * as fs from "fs-extra"
import * as os from "os"
import * as path from "path"
import { AppImageOptions, AppImageSignOptions } from "../../options/linuxOptions"
import { findSha256SigSection, zeroSigSection, writeSigSection } from "./elfSigSection"

interface ResolvedSignConfig {
  gpgPath: string
  gpgKeyId: string | null
  passphrase: string | null
  detachedSigFile: boolean
}

function isSigningRequested(options: AppImageOptions): boolean {
  if (process.env.APPIMAGE_SIGN === "true") {
    return true
  }
  return options.sign != null && options.sign !== false
}

async function findGpgBinary(configured: string | null | undefined): Promise<string> {
  if (configured) {
    return configured
  }

  const envPath = process.env.APPIMAGE_GPG_PATH
  if (envPath) {
    return envPath
  }

  // Try gpg2 first, then gpg
  for (const candidate of ["gpg2", "gpg"]) {
    try {
      await exec("which", [candidate])
      return candidate
    } catch {
      // not found, try next
    }
  }

  throw new Error("GPG binary not found. Install gpg2 or gpg, or set gpgPath / APPIMAGE_GPG_PATH.")
}

function resolveSignConfig(options: AppImageOptions): ResolvedSignConfig | null {
  if (!isSigningRequested(options)) {
    return null
  }

  const signOpts: AppImageSignOptions = typeof options.sign === "object" && options.sign != null ? options.sign : {}

  return {
    gpgPath: "", // resolved async later
    gpgKeyId: signOpts.gpgKeyId ?? process.env.APPIMAGE_GPG_KEY_ID ?? null,
    passphrase: signOpts.passphrase ?? process.env.APPIMAGE_GPG_PASSPHRASE ?? null,
    detachedSigFile: signOpts.detachedSigFile ?? false,
  }
}

/**
 * Signs an AppImage by embedding a GPG detached signature into its `.sha256_sig` ELF section,
 * following the AppImage signing specification.
 *
 * Specification: https://docs.appimage.org/packaging-guide/optional/signatures.html
 * ELF section layout: https://github.com/AppImage/AppImageSpec/blob/master/draft.md#signatures
 *
 * The process:
 * 1. Locate the `.sha256_sig` section (pre-allocated in the AppImage runtime, typically 1024 bytes)
 * 2. Zero the section so the signature covers the file without a previous signature
 * 3. Create an ASCII-armored GPG detached signature of the file
 * 4. Write the signature back into the `.sha256_sig` section
 *
 * The resulting AppImage can be verified with: ./<name>.AppImage --appimage-signature
 */
export async function signAppImage(appImagePath: string, options: AppImageOptions): Promise<void> {
  const config = resolveSignConfig(options)
  if (config == null) {
    return
  }

  log.info({ file: path.basename(appImagePath) }, "signing AppImage")

  // Resolve GPG binary
  const gpgConfiguredPath = typeof options.sign === "object" && options.sign != null ? options.sign.gpgPath : undefined
  config.gpgPath = await findGpgBinary(gpgConfiguredPath)

  // Find .sha256_sig section
  const section = await findSha256SigSection(appImagePath)
  if (section == null) {
    log.warn({ file: path.basename(appImagePath) }, "AppImage runtime does not contain a .sha256_sig section — skipping signing")
    return
  }

  // Zero the signature section before signing (spec requirement)
  const fd = await fs.open(appImagePath, "r+")
  try {
    await zeroSigSection(fd, section)
  } finally {
    await fs.close(fd)
  }

  // Create detached signature using GPG
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "appimage-sig-"))
  const sigFile = path.join(tmpDir, "signature.sig")

  try {
    const gpgArgs: string[] = ["--batch", "--yes", "--armor", "--detach-sign"]

    if (config.gpgKeyId) {
      gpgArgs.push("--default-key", config.gpgKeyId)
    }

    if (config.passphrase) {
      gpgArgs.push("--passphrase", config.passphrase, "--pinentry-mode", "loopback")
    }

    gpgArgs.push("--output", sigFile, appImagePath)

    await exec(config.gpgPath, gpgArgs)

    // Read the signature and write it into the ELF section
    const signature = await fs.readFile(sigFile)

    const writeFd = await fs.open(appImagePath, "r+")
    try {
      await writeSigSection(writeFd, section, signature)
    } finally {
      await fs.close(writeFd)
    }

    // Optionally produce a detached .sig file alongside the AppImage
    if (config.detachedSigFile) {
      await fs.copyFile(sigFile, `${appImagePath}.sig`)
    }

    log.info({ file: path.basename(appImagePath), signatureSize: signature.length, sectionSize: section.size }, "AppImage signed successfully")
  } finally {
    await fs.remove(tmpDir).catch(() => {})
  }
}
