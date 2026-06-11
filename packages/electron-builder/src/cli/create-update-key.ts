import { generateUpdateSigningKeypair, log } from "builder-util"
import chalk from "chalk"
import { writeFile } from "fs/promises"
import * as path from "path"

/**
 * Generates an Ed25519 keypair for signing auto-update manifests (A1).
 * Writes the private key to a 0600 file and prints the public key to embed in build config.
 * @internal
 */
export async function createUpdateKey(outFile?: string) {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  const privateKeyPath = path.resolve(outFile || "update-private-key.pem")
  await writeFile(privateKeyPath, privateKeyPem + "\n", { mode: 0o600 })

  log.info({ file: privateKeyPath }, "Ed25519 private key written (keep this secret — store it in a CI secret)")
  log.info(null, `Provide it at publish time via the ${chalk.bold("EP_UPDATE_SIGN_KEY")} (PEM literal) or ${chalk.bold("EP_UPDATE_SIGN_KEY_FILE")} (path) environment variable.`)
  log.info(null, "The matching public key is embedded into app-update.yml automatically; you do not need to configure it manually.\n")

  process.stdout.write(`${chalk.bold("Public key")} (for reference — auto-embedded into app-update.yml):\n${publicKeyPem}\n`)
}
