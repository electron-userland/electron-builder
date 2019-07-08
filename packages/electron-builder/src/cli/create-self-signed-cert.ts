import { exec, log, spawn, TmpDir } from "builder-util"
import { unlinkIfExists } from "builder-util/out/fs"
import chalk from "chalk"
import { getSignVendorPath } from "app-builder-lib/out/codeSign/windowsCodeSign"
import { ensureDir } from "fs-extra"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"

/** @internal */
export async function createSelfSignedCert(publisher: string) {
  const tmpDir = new TmpDir("create-self-signed-cert")
  const targetDir = process.cwd()
  const tempPrefix = path.join(await tmpDir.getTempDir({prefix: "self-signed-cert-creator"}), sanitizeFileName(publisher))
  const cer = `${tempPrefix}.cer`
  const pvk = `${tempPrefix}.pvk`

  log.info(chalk.bold('When asked to enter a password ("Create Private Key Password"), please select "None".'))

  try {
    await ensureDir(path.dirname(tempPrefix))
    const vendorPath = path.join(await getSignVendorPath(), "windows-10", process.arch)
    await exec(path.join(vendorPath, "makecert.exe"),
      ["-r", "-h", "0", "-n", `CN=${quoteString(publisher)}`, "-eku", "1.3.6.1.5.5.7.3.3", "-pe", "-sv", pvk, cer])

    const pfx = path.join(targetDir, `${sanitizeFileName(publisher)}.pfx`)
    await unlinkIfExists(pfx)
    await exec(path.join(vendorPath, "pvk2pfx.exe"), ["-pvk", pvk, "-spc", cer, "-pfx", pfx])
    log.info({file: pfx}, `created. Please see https://electron.build/code-signing how to use it to sign.`)

    const certLocation = "Cert:\\LocalMachine\\TrustedPeople"
    log.info({file: pfx, certLocation}, `importing. Operation will be succeed only if runned from root. Otherwise import file manually.`)
    await spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Import-PfxCertificate", "-FilePath", `"${pfx}"`, "-CertStoreLocation", ""])
  }
  finally {
    await tmpDir.cleanup()
  }
}

function quoteString(s: string): string {
  if (!s.includes(",") && !s.includes('"')) {
    return s
  }

  return `"${s.replace(/"/g, '\\"')}"`
}