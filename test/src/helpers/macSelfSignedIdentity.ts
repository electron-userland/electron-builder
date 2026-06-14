import { exec, TmpDir } from "builder-util"
import { outputFile } from "fs-extra"
import { readFile } from "fs/promises"
import * as path from "path"

export interface SelfSignedMacIdentity {
  /** Full certificate common name, e.g. `Developer ID Application: EB Test (TEAMID1234)`. */
  commonName: string
  /** base64-encoded PKCS#12, suitable for `CSC_LINK` / `MAC_CSC_LINK`. */
  p12Base64: string
  /** Password protecting the PKCS#12 and its private key. */
  password: string
}

const TEAM_ID = "TEAMID1234"
const PASSWORD = "eb-self-signed"

/**
 * Generates an ephemeral, untrusted self-signed macOS code-signing identity (no Apple Developer membership
 * required) and returns it as a base64 PKCS#12. Intended for local/CI signing tests in combination with
 * `CSC_ALLOW_SELF_SIGNED=true`. The produced artifacts are NOT trusted/notarizable.
 *
 * @param certPrefix one of the Apple certificate prefixes without the trailing colon, e.g. `Developer ID Application`.
 */
export async function createSelfSignedMacIdentity(certPrefix: string, tmpDir: TmpDir): Promise<SelfSignedMacIdentity> {
  const commonName = `${certPrefix}: EB Test (${TEAM_ID})`
  const dir = await tmpDir.getTempDir({ prefix: "self-signed-mac" })
  const keyPath = path.join(dir, "key.pem")
  const certPath = path.join(dir, "cert.pem")
  const p12Path = path.join(dir, "cert.p12")
  const configPath = path.join(dir, "openssl.cnf")

  await outputFile(
    configPath,
    `[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = ${commonName}
[v3]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
`
  )

  await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath, "-out", certPath, "-days", "3650", "-nodes", "-config", configPath])

  // Apple's `security import` cannot read PKCS#12 files produced with OpenSSL 3.x's default (stronger)
  // algorithms, so force the legacy SHA1/3DES scheme. LibreSSL (the system `openssl`) already produces a
  // compatible file and does not understand `-legacy`, so only pass it for OpenSSL >= 3.
  const p12Args = ["pkcs12", "-export", "-inkey", keyPath, "-in", certPath, "-out", p12Path, "-passout", `pass:${PASSWORD}`, "-name", commonName]
  if (await isOpenSsl3OrNewer()) {
    p12Args.push("-legacy", "-certpbe", "PBE-SHA1-3DES", "-keypbe", "PBE-SHA1-3DES", "-macalg", "sha1")
  }
  await exec("openssl", p12Args)

  const p12Base64 = (await readFile(p12Path)).toString("base64")
  return { commonName, p12Base64, password: PASSWORD }
}

async function isOpenSsl3OrNewer(): Promise<boolean> {
  const version = await exec("openssl", ["version"])
  const match = /^OpenSSL (\d+)\./.exec(version.trim())
  return match != null && Number(match[1]) >= 3
}
