import { exec, log, spawn, TmpDir } from "builder-util"
import { unlinkIfExists } from "builder-util/out/fs"
import { bold } from "chalk"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { quoteString } from "../targets/AppxTarget"
import { getSignVendorPath } from "../windowsCodeSign"

/** @internal */
export async function createSelfSignedCert(publisher: string) {
  const tmpDir = new TmpDir()
  const targetDir = process.cwd()
  const tempPrefix = path.join(await tmpDir.getTempDir(), sanitizeFileName(publisher))
  const cer = `${tempPrefix}.cer`
  const pvk = `${tempPrefix}.pvk`

  log(bold('When asked to enter a password ("Create Private Key Password"), please select "None".'))

  try {
    await ensureDir(path.dirname(tempPrefix))
    const vendorPath = path.join(await getSignVendorPath(), "windows-10", process.arch)
    await exec(path.join(vendorPath, "makecert.exe"),
      ["-r", "-h", "0", "-n", `CN=${quoteString(publisher)}`, "-eku", "1.3.6.1.5.5.7.3.3", "-pe", "-sv", pvk, cer])

    const pfx = path.join(targetDir, `${sanitizeFileName(publisher)}.pfx`)
    await unlinkIfExists(pfx)
    await exec(path.join(vendorPath, "pvk2pfx.exe"), ["-pvk", pvk, "-spc", cer, "-pfx", pfx])
    log(`${pfx} created. Please see https://electron.build/code-signing how to use it to sign.`)

    const certLocation = "Cert:\\LocalMachine\\TrustedPeople"
    log(`${pfx} will be imported into ${certLocation} Operation will be succeed only if runned from root. Otherwise import file manually.`)
    await spawn("powershell.exe", ["Import-PfxCertificate", "-FilePath", `"${pfx}"`, "-CertStoreLocation", ""])
  }
  finally {
    await tmpDir.cleanup()
  }
}