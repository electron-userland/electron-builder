import { generateUpdateSigningKeypair, InvalidConfigurationError, log } from "builder-util"
import { computeUpdateManifestKeyId } from "builder-util-runtime"
import * as chalk from "chalk"
import { writeFile } from "fs/promises"
import * as path from "path"

/**
 * Generates an Ed25519 keypair for signing auto-update manifests (A1).
 * Writes the private key to a new 0600 file and prints the public key to embed in build config.
 * Refuses to overwrite an existing file: a plain overwrite would silently replace a key that may already be
 * in use and would keep the old file's (possibly wider) permissions.
 */
export async function createUpdateKey(outFile?: string): Promise<{ privateKeyPath: string; publicKeyPem: string; keyId: string }> {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  const privateKeyPath = path.resolve(outFile || "update-private-key.pem")
  try {
    // "wx" creates the file exclusively, so the 0600 mode is always applied to a fresh file
    await writeFile(privateKeyPath, privateKeyPem + "\n", { mode: 0o600, flag: "wx" })
  } catch (e: any) {
    if (e?.code === "EEXIST") {
      throw new InvalidConfigurationError(`Refusing to overwrite existing key file ${privateKeyPath}; delete it or pass a different --out path`)
    }
    throw e
  }

  log.info({ file: privateKeyPath }, "Ed25519 private key written (keep this secret — store it in a CI secret)")
  log.info(
    null,
    `Provide it at publish time via the ${chalk.bold("ELECTRON_BUILDER_UPDATE_SIGN_KEY")} (PEM literal) or ${chalk.bold("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE")} (path) environment variable.`
  )
  log.info(null, "The matching public key is embedded into app-update.yml automatically; you do not need to configure it manually.\n")

  const keyId = computeUpdateManifestKeyId(publicKeyPem)
  process.stdout.write(`${chalk.bold("Public key")} (for reference — auto-embedded into app-update.yml):\n${publicKeyPem}\n`)
  process.stdout.write(`${chalk.bold("Key id")} (appears as \`keyId\` in the \`signatures\` list of each signed latest*.yml):\n${keyId}\n`)
  return { privateKeyPath, publicKeyPem, keyId }
}
